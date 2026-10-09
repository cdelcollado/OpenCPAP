import { describe, expect, it } from 'vitest';
import { checkSessions, detectLoader, groupNights, MemoryFS, loadCard, type Session } from '@opencpap/core';
import { resmedLoader, parseTgt, parseIdentificationJson, parseStr } from './index';
import { buildResmedCard, type FakeSession } from './testing/builders';

const T = (d: number, h: number, m = 0) => Date.UTC(2026, 2, d, h, m, 0);

const night1: FakeSession = {
  start: T(5, 22, 10), minutes: 90,
  events: [
    { text: 'Obstructive Apnea', onset: 600, duration: 14 }, { text: 'Central Apnea', onset: 1200, duration: 11 },
    { text: 'Hypopnea', onset: 1800, duration: 18 }, { text: 'Apnea', onset: 2400, duration: 10 }, { text: 'Arousal', onset: 3000 },
  ],
  leak: 0.1, pressure: 9,
};
const night1b: FakeSession = { start: T(6, 1, 0), minutes: 60, leak: 0.2, pressure: 9 };
const night2: FakeSession = { start: T(6, 22, 30), minutes: 120, csr: [{ onset: 3000, duration: 240 }] };

const load = async (card: MemoryFS) => { const out: Session[] = []; for await (const s of resmedLoader.load(card)) out.push(s); return out; };

describe('detect', () => {
  it('recognises a card with identification, STR and data', async () => {
    const r = await resmedLoader.detect(buildResmedCard({ sessions: [night1] }));
    expect(r).toMatchObject({ device: { manufacturer: 'ResMed', model: 'AirSense 10 AutoSet' } });
    expect(r!.confidence).toBeGreaterThan(0.9);
  });
  it('is less confident without identification', async () => {
    const r = await resmedLoader.detect(buildResmedCard({ sessions: [night1], noIdentification: true }));
    expect(r!.confidence).toBeLessThan(0.9);
  });
  it('ignores other cards', async () => {
    expect(await resmedLoader.detect(new MemoryFS(new Map([['P-SERIES/X/PROP.BIN', new Uint8Array(4)]])))).toBeNull();
    expect(await resmedLoader.detect(new MemoryFS(new Map()))).toBeNull();
  });
  it('is chosen over nothing else and by case-insensitive paths', async () => {
    const card = buildResmedCard({ sessions: [night1] });
    const upper = new Map<string, Uint8Array>();
    for (const p of await card.list()) upper.set(p.toUpperCase(), await card.read(p));
    expect((await detectLoader(new MemoryFS(upper), [resmedLoader]))?.loader.id).toBe('resmed');
  });
});

describe('load', () => {
  it('builds one session per flow file with device identity', async () => {
    const sessions = await load(buildResmedCard({ sessions: [night1, night1b, night2], serial: 'SYNTH123' }));
    expect(sessions).toHaveLength(3);
    expect(sessions[0]!.device).toEqual({ manufacturer: 'ResMed', model: 'AirSense 10 AutoSet', serial: 'SYNTH123', firmware: 'SX567-0401' });
    expect(sessions[0]!.clock).toBe('device-local');
    expect(sessions[0]!.start).toBe(night1.start);
    expect(sessions[0]!.end).toBe(night1.start + 90 * 60_000);
    expect(sessions.map((s) => s.id)).toEqual([...sessions.map((s) => s.id)].sort((a, b) => a - b));
    expect(new Set(sessions.map((s) => s.id)).size).toBe(3);
  });

  it('maps event annotations to canonical events with absolute times', async () => {
    const [s] = await load(buildResmedCard({ sessions: [night1] }));
    expect(s!.events.map((e) => [e.type, e.start - night1.start, e.duration])).toEqual([
      ['obstructive', 600_000, 14], ['central', 1_200_000, 11], ['hypopnea', 1_800_000, 18], ['unclassified-apnea', 2_400_000, 10], ['rera', 3_000_000, 0],
    ]);
  });

  it('reads flow in L/min and pressure from the 25 Hz file', async () => {
    const [s] = await load(buildResmedCard({ sessions: [night1] }));
    const flow = s!.waveforms.find((w) => w.channel === 'flow')!;
    expect(flow.sampleRate).toBe(25);
    expect(flow.unit).toBe('L/min');
    expect(flow.samples.length).toBe(90 * 60 * 25);
    expect(Math.max(...flow.samples.subarray(0, 500))).toBeCloseTo(30, 0); // 0.5 L/s × 60
    expect(s!.waveforms.find((w) => w.channel === 'pressure')!.samples[0]).toBeCloseTo(9, 1);
  });

  it('reads leak in L/min as unintentional leak and keeps pressure changes only', async () => {
    const [s] = await load(buildResmedCard({ sessions: [night1] }));
    const leak = s!.statistics.find((t) => t.channel === 'leak-unintentional')!;
    expect(leak.unit).toBe('L/min');
    expect(leak.values[0]).toBeCloseTo(6, 1); // 0.1 L/s
    expect(leak.times[0]).toBe(night1.start + 2000); // reported at the end of its 2 s interval
    expect(leak.times.length).toBe(90 * 30);
    const p = s!.statistics.find((t) => t.channel === 'pressure-set')!;
    expect(p.times.length).toBe(1);
    expect(p.values[0]).toBeCloseTo(9, 1);
  });

  it('applies the settings of the STR.edf day (APAP and CPAP)', async () => {
    const [apap] = await load(buildResmedCard({ sessions: [night1], mode: 1, minPressure: 6, maxPressure: 12 }));
    expect(apap!.settings).toMatchObject({ mode: 'auto-cpap', pressureMin: 6, pressureMax: 12, flexMode: 'epr', flexLevel: 3 });
    const [cpap] = await load(buildResmedCard({ sessions: [night1], mode: 0, pressure: 10 }));
    expect(cpap!.settings).toMatchObject({ mode: 'cpap', pressure: 10 });
    expect(cpap!.settings.pressureMin).toBeUndefined();
  });

  it('works without STR.edf or identification', async () => {
    const [s] = await load(buildResmedCard({ sessions: [night1], noStr: true, noIdentification: true }));
    expect(s!.settings).toEqual({});
    expect(s!.device.serial).toBe('');
    expect(s!.device.model).toBe('ResMed device');
    expect(s!.events).toHaveLength(5);
  });

  it('attaches event and pressure files that start a few seconds off to their flow file', async () => {
    const sessions = await load(buildResmedCard({ sessions: [{ ...night1, skewSeconds: 3 }] }));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.events).toHaveLength(5);
    expect(sessions[0]!.statistics.length).toBeGreaterThan(0);
  });

  it('keeps a session that has only events and pressure (no flow file)', async () => {
    const [s] = await load(buildResmedCard({ sessions: [{ ...night1, omit: ['BRP'] }] }));
    expect(s!.waveforms).toEqual([]);
    expect(s!.events).toHaveLength(5);
    expect(s!.end - s!.start).toBe(90 * 60_000);
  });

  it('turns CSR episodes into periodic-breathing events', async () => {
    const sessions = await load(buildResmedCard({ sessions: [night2] }));
    expect(sessions[0]!.events).toEqual([{ type: 'periodic-breathing', start: night2.start + 3_000_000, duration: 240 }]);
  });

  it('skips a damaged data file and still imports the rest', async () => {
    const card = buildResmedCard({ sessions: [night1, night2] });
    const files = new Map<string, Uint8Array>();
    for (const p of await card.list()) files.set(p, await card.read(p));
    const bad = [...files.keys()].find((p) => p.endsWith('221000_BRP.edf'))!;
    files.set(bad, new Uint8Array(100));
    const sessions = await load(new MemoryFS(files));
    // the first night keeps its events/pressure as a flow-less session, the second is intact
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.waveforms).toEqual([]);
  });

  it('reports progress', async () => {
    const calls: [number, number][] = [];
    for await (const s of resmedLoader.load(buildResmedCard({ sessions: [night1, night2] }), (d, t) => calls.push([d, t]))) void s;
    expect(calls.at(-1)).toEqual([2, 2]);
  });
});

describe('conformance', () => {
  it('passes the shared loader checks (units, ordering, containment)', async () => {
    const sessions = await load(buildResmedCard({ sessions: [night1, night1b, night2] }));
    expect(checkSessions(sessions)).toEqual([]);
  });
});

describe('integration with the canonical analytics', () => {
  it('groups sessions into nights and computes the same AHI the device reports in STR.edf', async () => {
    const card = buildResmedCard({ sessions: [night1, night1b, night2] });
    const sessions: Session[] = [];
    for await (const s of loadCard(card, [resmedLoader])) sessions.push(s);
    const nights = groupNights(sessions.map((s) => ({ ...s, waveforms: undefined as never })) as never);
    expect(nights.map((n) => n.date)).toEqual(['2026-03-05', '2026-03-06']);
    const n1 = nights[0]!;
    expect(n1.usageHours).toBeCloseTo(2.5, 5);
    expect(n1.counts.obstructive).toBe(1);
    expect(n1.leakKind).toBe('unintentional');
    expect(n1.pressure).toEqual(expect.objectContaining({ min: 6, max: 12 }));
    // STR.edf reports AHI per day: (OA + CA + H + UA) / hours = 4 / 2.5 h = 1.6
    const days = parseStr(await card.read('STR.edf'));
    expect(days[0]!.summary.ahi).toBeCloseTo(n1.ahi!, 2);
    expect(days[0]!.summary.usageHours).toBeCloseTo(n1.usageHours, 2);
  });
});

describe('identification files', () => {
  it('parses Identification.tgt', () => {
    expect(parseTgt('#SRN 22123456789\r\n#PNA AirCurve_10_VAuto\n#PCD 37208\n')).toEqual({ serial: '22123456789', product: 'AirCurve 10 VAuto', productCode: '37208', firmware: undefined });
    expect(parseTgt('nothing here')).toBeUndefined();
  });
  it('searches Identification.json for known keys at any depth', () => {
    const json = JSON.stringify({ FlowGenerator: { IdentificationProfiles: { Product: { SerialNumber: 'S11-1', ProductName: 'AirSense_11_AutoSet', ProductCode: 39500 } } } });
    expect(parseIdentificationJson(json)).toMatchObject({ serial: 'S11-1', product: 'AirSense 11 AutoSet', productCode: '39500' });
    expect(parseIdentificationJson('{not json')).toBeUndefined();
    expect(parseIdentificationJson('{}')).toBeUndefined();
  });
});

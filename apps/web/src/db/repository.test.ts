import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDemoSessions } from '@opencpap/core';
import { OpenCpapDb } from './db';
import { Repository, deviceIdOf, sessionKey } from './repository';

let n = 0;
let repo: Repository;
beforeEach(() => { repo = new Repository(new OpenCpapDb(`test-${n++}`)); });

const demo = () => generateDemoSessions({ nights: 12, seed: 3, waveformNights: 2 });

describe('Repository', () => {
  it('stores sessions and returns nights', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    const nights = await repo.nights();
    expect(nights.length).toBe(sessions.length);
    expect(nights.slice(-2).every((x) => x.hasWaveforms)).toBe(true);
    expect(nights[0]!.hasWaveforms).toBe(false);
    expect(await repo.counts()).toEqual({ sessions: sessions.length, waveformSegments: 2 });
  });

  it('is idempotent: re-importing the same card does not duplicate', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    for (const s of sessions) await repo.saveSession(s);
    expect((await repo.counts()).sessions).toBe(sessions.length);
    expect((await repo.counts()).waveformSegments).toBe(2);
  });

  it('replaces a session and drops stale waveforms', async () => {
    const [s] = generateDemoSessions({ nights: 1, seed: 1, waveformNights: 1 });
    await repo.saveSession(s!);
    expect((await repo.counts()).waveformSegments).toBe(1);
    await repo.saveSession({ ...s!, waveforms: [] });
    expect((await repo.counts()).waveformSegments).toBe(0);
  });

  it('round-trips typed arrays of a night', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    const last = sessions.at(-1)!;
    const night = await repo.night((await repo.nights()).at(-1)!.date);
    expect(night.sessions.map((x) => x.id)).toContain(last.id);
    expect(night.waveforms[0]!.samples).toBeInstanceOf(Float32Array);
    expect(night.waveforms[0]!.samples.length).toBe(last.waveforms[0]!.samples.length);
    expect(night.sessions[0]!.statistics[0]!.values).toBeInstanceOf(Float32Array);
  });

  it('keeps sessions from different devices apart and deletes one device', async () => {
    const a = generateDemoSessions({ nights: 3, seed: 1, waveformNights: 1 });
    const b = generateDemoSessions({ nights: 3, seed: 1, waveformNights: 1 }).map((s) => ({ ...s, device: { ...s.device, serial: 'OTHER' } }));
    for (const s of [...a, ...b]) await repo.saveSession(s);
    expect((await repo.counts()).sessions).toBe(a.length + b.length);
    expect((await repo.devices()).map((d) => d.sessions)).toEqual([a.length, b.length]);
    await repo.deleteDevice(deviceIdOf(b[0]!));
    expect((await repo.counts()).sessions).toBe(a.length);
    expect((await repo.counts()).waveformSegments).toBe(1);
  });

  it('clears everything', async () => {
    for (const s of demo()) await repo.saveSession(s);
    await repo.clearAll();
    expect(await repo.counts()).toEqual({ sessions: 0, waveformSegments: 0 });
  });

  it('builds stable keys', () => {
    const [s] = demo();
    expect(sessionKey(s!)).toBe(`${deviceIdOf(s!)}/${s!.id}`);
  });
});

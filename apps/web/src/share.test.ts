import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { generateDemoSessions, groupNights } from '@opencpap/core';
import type { ReportInput } from './features/report/ReportDocument';
import { decodeSnapshot, encodeSnapshot, isEncrypted, makeSnapshot, ShareError, snapshotToReport, validateSnapshot } from './share';

const nights = groupNights(generateDemoSessions({ nights: 40, waveformNights: 0 }).map(({ waveforms: _w, ...s }) => s));
const input = (o: Partial<ReportInput> = {}): ReportInput => ({
  from: nights[10]!.date, to: nights.at(-1)!.date, asOf: nights.at(-1)!.date, totalDays: nights.length - 10, nights: nights.slice(10), previous: { from: nights[0]!.date, to: nights[9]!.date, nights: nights.slice(0, 10) },
  changes: [], equipment: [{ id: 'x', kind: 'mask', name: 'Secret mask name', startDate: '2026-01-01', intervalDays: 90 }],
  journal: [{ date: nights[12]!.date, note: 'PRIVATE NOTE', tags: ['private-tag'], updatedAt: 1 }], device: 'Demo Device', patient: 'A. Person', generated: 'today',
  options: { includeNotes: true, includeNights: true, includeEquipment: true, includeCompare: true }, ...o,
});

describe('share snapshot', () => {
  it('round-trips the figures of a report', async () => {
    const snap = makeSnapshot(input(), '2026-05-01');
    const back = await decodeSnapshot(await encodeSnapshot(snap));
    const n = nights.length - 10;
    expect(back.nights).toHaveLength(n);
    expect(back.nights[0]!.date).toBe(nights[10]!.date);
    expect(back.nights[5]!.counts).toEqual(snap.nights[5]!.counts);
    expect(back.nights[5]!.usageHours).toBeCloseTo(nights[15]!.usageHours, 3);
    expect(back.previous?.nights).toHaveLength(10);
    expect(back.patient).toBe('A. Person');
    const report = snapshotToReport(back, 'May 1');
    expect(report.nights[5]!.hasWaveforms).toBe(false);
    expect(report.options).toMatchObject({ includeNotes: false, includeEquipment: false, includeCompare: true });
  });

  it('never carries notes, tags, equipment or settings', async () => {
    const payload = await encodeSnapshot(makeSnapshot(input()));
    const text = JSON.stringify(await decodeSnapshot(payload));
    for (const secret of ['PRIVATE NOTE', 'private-tag', 'Secret mask name', 'settings', 'sessionIds']) expect(text).not.toContain(secret);
    expect(snapshotToReport(await decodeSnapshot(payload), '').journal).toEqual([]);
  });

  it('is small enough for a link (90 nights well under the safe length)', async () => {
    const big = input({ nights: [...nights, ...nights].slice(0, 80) });
    expect((await encodeSnapshot(makeSnapshot(big))).length).toBeLessThan(30_000);
  });

  it('uses only URL-safe characters', async () => {
    expect(await encodeSnapshot(makeSnapshot(input()))).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('passphrase encryption', () => {
  it('requires the right passphrase and hides the content', async () => {
    const payload = await encodeSnapshot(makeSnapshot(input()), 'correct horse');
    expect(isEncrypted(payload)).toBe(true);
    expect(isEncrypted(await encodeSnapshot(makeSnapshot(input())))).toBe(false);
    await expect(decodeSnapshot(payload)).rejects.toMatchObject({ code: 'passphrase-required' });
    await expect(decodeSnapshot(payload, 'wrong')).rejects.toMatchObject({ code: 'wrong-passphrase' });
    expect((await decodeSnapshot(payload, 'correct horse')).nights).toHaveLength(nights.length - 10);
    // the plain-text figures are not recoverable from the ciphertext without inflating it first
    expect(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('A. Person');
  }, 30_000);

  it('uses a fresh salt and iv every time', async () => {
    const s = makeSnapshot(input());
    expect(await encodeSnapshot(s, 'x')).not.toBe(await encodeSnapshot(s, 'x'));
  }, 30_000);

  it('detects tampering', async () => {
    const payload = await encodeSnapshot(makeSnapshot(input()), 'pw');
    const raw = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    raw[raw.length - 5]! ^= 1;
    const bad = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeSnapshot(bad, 'pw')).rejects.toMatchObject({ code: 'wrong-passphrase' });
  }, 30_000);
});

describe('hostile or damaged links', () => {
  const link = (obj: unknown) => { const b = deflateSync(new TextEncoder().encode(JSON.stringify(obj))); return btoa(String.fromCharCode(0, ...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const good = () => JSON.parse(JSON.stringify(makeSnapshot(input())));

  it('rejects garbage, empty, huge and non-base64 payloads', async () => {
    for (const p of ['', 'not base64!!', 'AAAA', 'AQAAAAAA', 'A'.repeat(500_000)]) await expect(decodeSnapshot(p)).rejects.toBeInstanceOf(ShareError);
  });
  it('rejects wrong shapes and versions', async () => {
    await expect(decodeSnapshot(link({ v: 2 }))).rejects.toMatchObject({ code: 'unsupported-version' });
    await expect(decodeSnapshot(link({ ...good(), nights: 'x' }))).rejects.toMatchObject({ code: 'bad-link' });
    await expect(decodeSnapshot(link({ ...good(), from: '<script>' }))).rejects.toMatchObject({ code: 'bad-link' });
    await expect(decodeSnapshot(link({ ...good(), nights: [{ date: '2026-01-01' }] }))).rejects.toMatchObject({ code: 'bad-link' });
    await expect(decodeSnapshot(link({ ...good(), changes: [{ date: 'x' }] }))).rejects.toMatchObject({ code: 'bad-link' });
  });
  it('truncates over-long free text', () => {
    const s = validateSnapshot({ ...good(), patient: 'x'.repeat(500), device: 'y'.repeat(500) });
    expect(s.patient).toHaveLength(80);
    expect(s.device).toHaveLength(200);
  });
});

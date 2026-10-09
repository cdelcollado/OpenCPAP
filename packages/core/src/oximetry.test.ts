import { describe, expect, it } from 'vitest';
import { findDesaturations, oximetryStats, overlapMinutes, parseOximetryCsv, shiftRecording, splitByNight, type OximetryRecording } from './oximetry';

const T0 = Date.UTC(2026, 2, 5, 23, 0, 0);
/** 1 Hz recording of `seconds`, SpO2 96 with the given dips: [startSecond, durationSeconds, depth] */
function synth(seconds: number, dips: [number, number, number][] = [], base = 96): OximetryRecording {
  const times = new Float64Array(seconds), spo2 = new Float32Array(seconds), pulse = new Float32Array(seconds);
  for (let i = 0; i < seconds; i++) {
    times[i] = T0 + i * 1000;
    spo2[i] = base; pulse[i] = 60 + (i % 5);
    for (const [s, d, depth] of dips) if (i >= s && i < s + d) spo2[i] = base - depth;
  }
  return { times, spo2, pulse };
}

describe('parseOximetryCsv', () => {
  it('reads a Wellue / ViHealth style export', () => {
    const csv = 'Time,Oxygen Level,Pulse Rate,Motion,SpO2 Reminder,PR Reminder\n23:00:01 Mar 05 2026,97,62,0,0,0\n23:00:02 Mar 05 2026,96,63,1,0,0\n23:00:03 Mar 05 2026,95,64,0,0,0\n';
    const p = parseOximetryCsv(csv);
    expect(p.format).toBe('time-month-day-year');
    expect(p.recording.times[0]).toBe(Date.UTC(2026, 2, 5, 23, 0, 1));
    expect([...p.recording.spo2]).toEqual([97, 96, 95]);
    expect([...p.recording.pulse]).toEqual([62, 63, 64]);
    expect(p.columns).toEqual({ time: 'Time', spo2: 'Oxygen Level', pulse: 'Pulse Rate' });
    expect(p.skipped).toBe(0);
  });
  it('reads ISO times and semicolon separated files', () => {
    const p = parseOximetryCsv('Date;SpO2(%);Pulse(bpm)\n2026-03-05 23:00:00;97;60\n2026-03-05 23:00:04;96;61\n2026-03-05T23:00:08;96;61\n');
    expect(p.format).toBe('iso');
    expect(p.recording.times.length).toBe(3);
    expect(p.recording.times[2]! - p.recording.times[0]!).toBe(8000);
  });
  it('tells day-first from month-first when the data allows, and flags what it cannot tell', () => {
    const dayFirst = parseOximetryCsv('Time,SpO2,Pulse\n25/03/2026 23:00:00,97,60\n25/03/2026 23:00:04,97,60\n');
    expect(dayFirst.recording.times[0]).toBe(Date.UTC(2026, 2, 25, 23, 0, 0));
    expect(dayFirst.ambiguousDate).toBe(false);
    const monthFirst = parseOximetryCsv('Time,SpO2,Pulse\n03/25/2026 11:00:00 PM,97,60\n03/25/2026 11:00:04 PM,97,60\n');
    expect(monthFirst.recording.times[0]).toBe(Date.UTC(2026, 2, 25, 23, 0, 0));
    expect(monthFirst.format).toBe('month-day-year');
    const unclear = parseOximetryCsv('Time,SpO2,Pulse\n03/04/2026 23:00:00,97,60\n03/04/2026 23:00:04,97,60\n');
    expect(unclear.ambiguousDate).toBe(true);
    expect(unclear.recording.times[0]).toBe(Date.UTC(2026, 3, 3, 23, 0, 0)); // assumed day first
  });
  it('lets the caller override the day/month order when it cannot be told', () => {
    const csv = 'Time,SpO2,Pulse\n03/04/2026 23:00:00,97,60\n03/04/2026 23:00:04,97,60\n';
    expect(parseOximetryCsv(csv, { dayFirst: false }).recording.times[0]).toBe(Date.UTC(2026, 2, 4, 23, 0, 0));
    expect(parseOximetryCsv(csv, { dayFirst: false }).ambiguousDate).toBe(true);
  });
  it('turns invalid sensor values into NaN and skips unreadable rows', () => {
    const p = parseOximetryCsv('Time,SpO2,Pulse\n2026-03-05 23:00:00,0,255\n2026-03-05 23:00:01,97,60\nnot a time,97,60\n2026-03-05 23:00:02,97,60\n');
    expect(Number.isNaN(p.recording.spo2[0]!)).toBe(true);
    expect(Number.isNaN(p.recording.pulse[0]!)).toBe(true);
    expect(p.skipped).toBe(1);
  });
  it('sorts and de-duplicates by time', () => {
    const p = parseOximetryCsv('Time,SpO2\n2026-03-05 23:00:02,95\n2026-03-05 23:00:00,97\n2026-03-05 23:00:00,97\n2026-03-05 23:00:01,96\n');
    expect([...p.recording.spo2]).toEqual([97, 96, 95]);
  });
  it('rejects files it cannot understand', () => {
    expect(() => parseOximetryCsv('a,b\n1,2')).toThrow(/data rows/);
    expect(() => parseOximetryCsv('x,y\n1,2\n3,4\n5,6')).toThrow(/time column/);
    expect(() => parseOximetryCsv('Time,SpO2\nfoo,1\nbar,2\nbaz,3')).toThrow(/No readable rows/);
  });
});

describe('desaturations and statistics', () => {
  it('counts dips of 3 and 4 points separately and computes the indexes per hour', () => {
    // one hour; six dips of 4 points and four dips of 3 points, 30 s each, separated by 4 minutes
    const dips: [number, number, number][] = [];
    for (let k = 0; k < 6; k++) dips.push([300 + k * 300, 30, 4]);
    for (let k = 0; k < 4; k++) dips.push([2100 + k * 300, 30, 3]);
    const r = synth(3600, dips);
    expect(findDesaturations(r, 3)).toHaveLength(10);
    expect(findDesaturations(r, 4)).toHaveLength(6);
    const s = oximetryStats(r);
    expect(s.odi3).toBeCloseTo(10, 1);
    expect(s.odi4).toBeCloseTo(6, 1);
    expect(s.spo2Min).toBe(92);
  });
  it('ignores short blips and one long slow drift', () => {
    expect(findDesaturations(synth(600, [[100, 4, 6]]), 3)).toHaveLength(0); // 4 s: too short
    const slow = synth(1200);
    for (let i = 0; i < 1200; i++) slow.spo2[i] = 96 - (i / 1200) * 8; // falls 8 points over 20 minutes
    expect(findDesaturations(slow, 3)).toHaveLength(0);
  });
  it('computes time under 90 % and 88 %, weighting by time', () => {
    const r = synth(1000, [[0, 100, 8], [500, 100, 10]]); // 100 s at 88, 100 s at 86
    const s = oximetryStats(r);
    expect(s.t90).toBeCloseTo(20, 1);
    expect(s.t88).toBeCloseTo(10, 1); // only the 86 % stretch is below 88
    expect(s.spo2Mean).toBeCloseTo(96 - (100 * 8 + 100 * 10) / 1000, 1);
  });
  it('does not count gaps as data and reports pulse', () => {
    const r: OximetryRecording = { times: Float64Array.of(T0, T0 + 1000, T0 + 3_600_000), spo2: Float32Array.of(96, 96, 96), pulse: Float32Array.of(60, 70, NaN) };
    const s = oximetryStats(r);
    expect(s.seconds).toBeCloseTo(1 + 30 + 1, 0); // the hour-long gap is capped at 30 s
    expect(s.pulseMin).toBe(60);
    expect(s.pulseMax).toBe(70);
  });
  it('has no indexes without valid data', () => {
    const s = oximetryStats({ times: Float64Array.of(T0, T0 + 1000), spo2: Float32Array.of(NaN, NaN), pulse: Float32Array.of(NaN, NaN) });
    expect(s).toMatchObject({ seconds: 0, spo2Mean: undefined, odi3: undefined, desaturations3: 0 });
  });
});

describe('alignment helpers', () => {
  it('splits a recording that spans noon into two nights', () => {
    const r: OximetryRecording = { times: Float64Array.of(Date.UTC(2026, 2, 5, 23), Date.UTC(2026, 2, 6, 6), Date.UTC(2026, 2, 6, 13)), spo2: Float32Array.of(95, 96, 97), pulse: Float32Array.of(60, 61, 62) };
    const by = splitByNight(r);
    expect([...by.keys()].sort()).toEqual(['2026-03-05', '2026-03-06']);
    expect(by.get('2026-03-05')!.times.length).toBe(2);
  });
  it('shifts times by minutes', () => {
    expect(shiftRecording(synth(2), -30).times[0]).toBe(T0 - 30 * 60_000);
  });
  it('measures how much of the recording falls inside the therapy sessions', () => {
    const r = synth(7200);
    expect(overlapMinutes(r, [[T0, T0 + 3600_000]])).toBeCloseTo(60, 0);
    expect(overlapMinutes(r, [[T0 + 7300_000, T0 + 8000_000]])).toBe(0);
  });
});

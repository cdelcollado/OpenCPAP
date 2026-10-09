import type { Session } from './model';

/**
 * Conformance checks every device loader's output must pass, independent of manufacturer. They encode the
 * invariants the rest of the app silently relies on (units, ordering, containment), so a new loader fails here with a
 * readable message instead of producing odd charts later. Run it from the loader's tests on a synthetic card:
 *
 * ```ts
 * expect(checkSessions(sessions)).toEqual([]);
 * ```
 *
 * See docs/adding-a-device.md.
 */
export interface ConformanceIssue {
  /** device-provided session id, or -1 for card-level problems */
  session: number;
  message: string;
}

const EVENT_TYPES = new Set([
  'obstructive', 'central', 'hypopnea', 'unclassified-apnea', 'rera', 'flow-limitation', 'snore',
  'periodic-breathing', 'large-leak', 'vibratory-snore', 'variable-breathing',
]);

/** Slack, ms, for timestamps that devices round to whole seconds (OSCAR sees up to 1 s of jitter on DS2). */
const SLACK_MS = 2000;

export function checkSessions(sessions: readonly Session[]): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const add = (session: number, message: string) => issues.push({ session, message });
  if (sessions.length === 0) add(-1, 'the loader produced no sessions');

  const seen = new Set<string>();
  for (const s of sessions) {
    const id = s.id;
    const key = `${s.device.manufacturer}:${s.device.serial}:${id}`;
    if (seen.has(key)) add(id, 'session id is not unique within its device');
    seen.add(key);

    if (!s.device.manufacturer) add(id, 'device.manufacturer is empty');
    if (!s.device.model) add(id, 'device.model is empty');
    if (s.clock !== 'utc' && s.clock !== 'device-local') add(id, `clock "${String(s.clock)}" is not utc/device-local`);
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) { add(id, `start/end are not a positive interval (${s.start}..${s.end})`); continue; }
    // epoch milliseconds, not seconds: anything before 2000 is almost certainly a unit mistake
    if (s.start < Date.UTC(2000, 0, 1)) add(id, 'start is before year 2000; timestamps must be epoch milliseconds');

    let prevEnd = -Infinity;
    for (const sl of s.slices) {
      if (!(sl.end > sl.start)) add(id, `slice ${sl.start}..${sl.end} is empty or reversed`);
      if (sl.start < s.start - SLACK_MS || sl.end > s.end + SLACK_MS) add(id, `slice ${sl.start}..${sl.end} lies outside the session`);
      if (sl.start < prevEnd - SLACK_MS) add(id, 'slices overlap or are not sorted');
      prevEnd = sl.end;
    }
    if (!s.slices.some((sl) => sl.status === 'mask-on')) add(id, 'no mask-on slice, so the session has no therapy time');

    for (const e of s.events) {
      if (!EVENT_TYPES.has(e.type)) add(id, `unknown event type "${e.type}"`);
      if (!(e.duration >= 0) || !Number.isFinite(e.duration)) add(id, `event ${e.type} has an invalid duration ${e.duration}`);
      if (e.start < s.start - SLACK_MS || e.start > s.end + SLACK_MS) add(id, `event ${e.type} at ${e.start} lies outside the session`);
      if (e.duration > 3600) add(id, `event ${e.type} lasts ${e.duration} s; durations must be in seconds`);
    }
    for (let i = 1; i < s.events.length; i++) if (s.events[i]!.start < s.events[i - 1]!.start) { add(id, 'events are not sorted by start'); break; }

    for (const w of s.waveforms) {
      const label = `waveform ${w.channel}`;
      if (!(w.sampleRate > 0)) add(id, `${label} has no sample rate`);
      if (w.samples.length === 0) add(id, `${label} has no samples`);
      if (w.start < s.start - SLACK_MS) add(id, `${label} starts before the session`);
      const end = w.start + (w.samples.length / w.sampleRate) * 1000;
      if (end > s.end + SLACK_MS * 5) add(id, `${label} ends ${Math.round((end - s.end) / 1000)} s after the session`);
      let bad = 0;
      for (let i = 0; i < w.samples.length; i++) if (!Number.isFinite(w.samples[i]!)) bad++;
      if (bad) add(id, `${label} has ${bad} non-finite samples`);
      if (w.channel === 'flow' && w.unit !== 'L/min') add(id, `flow must be in L/min, got "${w.unit}"`);
      if (w.channel === 'pressure' && w.unit !== 'cmH2O') add(id, `pressure must be in cmH2O, got "${w.unit}"`);
    }

    for (const t of s.statistics) {
      const label = `statistics ${t.channel}`;
      if (t.times.length !== t.values.length) add(id, `${label}: times and values differ in length`);
      for (let i = 1; i < t.times.length; i++) if (t.times[i]! < t.times[i - 1]!) { add(id, `${label}: times are not ascending`); break; }
      if (t.times.length && (t.times[0]! < s.start - SLACK_MS || t.times[t.times.length - 1]! > s.end + SLACK_MS * 5)) add(id, `${label} lies outside the session`);
      if ((t.channel === 'leak-total' || t.channel === 'leak-unintentional') && t.unit !== 'L/min') add(id, `${label} must be in L/min, got "${t.unit}"`);
      if (t.channel.includes('press') && t.unit !== 'cmH2O') add(id, `${label} must be in cmH2O, got "${t.unit}"`);
      if (t.values.some((v) => !Number.isFinite(v))) add(id, `${label} has non-finite values`);
    }
  }
  return issues;
}

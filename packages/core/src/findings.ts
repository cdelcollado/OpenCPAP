import type { ChangeEvent } from './changes';
import type { NightSummary, SessionLite } from './nights';

export type FindingLevel = 'good' | 'info' | 'warn';
/** A language-neutral observation: `id` selects the text, `params` fill its placeholders. The app translates it. */
export interface Finding { id: string; level: FindingLevel; params: Record<string, number | string> }

export interface FindingContext {
  /** averages of the nights before this one (see `baseline` in the app) */
  baseline: { usage?: number; ahi?: number; leak?: number };
  /** settings changes (any dates); only one on this night is reported */
  changes?: ChangeEvent[];
  sessions?: Pick<SessionLite, 'slices' | 'events'>[];
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Plain-language observations about one night. Deterministic rules (no models), neutral wording, no diagnosis or advice
 * on settings. Thresholds are visual reading aids, documented in docs/analytics.md.
 */
export function nightFindings(n: NightSummary, ctx: FindingContext): Finding[] {
  const out: Finding[] = [];
  const hours = round(n.usageHours, 1);
  const minutes = Math.round(n.usageHours * 60);

  if (n.usageHours < 2) out.push({ id: 'usageVeryShort', level: 'warn', params: { hours, minutes } });
  else if (n.usageHours < 4) out.push({ id: 'usageShort', level: 'warn', params: { hours, minutes } });
  else out.push({ id: 'usageOk', level: 'good', params: { hours, minutes } });

  if (n.ahi !== undefined) {
    const id = n.ahi < 5 ? 'ahiLow' : n.ahi < 15 ? 'ahiMid' : 'ahiHigh';
    out.push({ id, level: n.ahi < 5 ? 'good' : 'warn', params: { ahi: round(n.ahi, 1) } });
    const base = ctx.baseline.ahi;
    if (base !== undefined && n.usageHours >= 4) {
      if (n.ahi >= base * 1.5 && n.ahi - base >= 1) out.push({ id: 'ahiAboveUsual', level: 'info', params: { ahi: round(n.ahi, 1), usual: round(base, 1) } });
      else if (n.ahi <= base * 0.67 && base - n.ahi >= 1) out.push({ id: 'ahiBelowUsual', level: 'info', params: { ahi: round(n.ahi, 1), usual: round(base, 1) } });
    }
  }

  const leakBase = ctx.baseline.leak;
  if (n.leak && leakBase !== undefined && n.leak.p95 >= leakBase * 1.25 && n.leak.p95 - leakBase >= 5) {
    out.push({ id: 'leakHigh', level: 'warn', params: { leak: round(n.leak.p95, 0), usual: round(leakBase, 0) } });
  }

  const sessions = ctx.sessions ?? [];
  const bigLeakSeconds = sessions.flatMap((s) => s.events).filter((e) => e.type === 'large-leak').reduce((a, e) => a + e.duration, 0);
  if (bigLeakSeconds >= 300) out.push({ id: 'largeLeak', level: 'warn', params: { minutes: Math.round(bigLeakSeconds / 60) } });

  const gaps = sessions.flatMap((s) => s.slices).filter((sl) => sl.status === 'mask-off');
  if (gaps.length > 0) out.push({ id: 'maskOff', level: 'info', params: { count: gaps.length, minutes: Math.max(1, Math.round(gaps.reduce((a, g) => a + (g.end - g.start), 0) / 60000)) } });

  const pbSeconds = sessions.flatMap((s) => s.events).filter((e) => e.type === 'periodic-breathing').reduce((a, e) => a + e.duration, 0);
  if (pbSeconds >= 300) out.push({ id: 'periodic', level: 'info', params: { minutes: Math.round(pbSeconds / 60) } });

  if (n.reraIndex !== undefined && n.reraIndex >= 5) out.push({ id: 'reraHigh', level: 'info', params: { index: round(n.reraIndex, 1) } });

  const change = ctx.changes?.find((c) => c.date === n.date);
  if (change) out.push({ id: 'settingsChanged', level: 'info', params: { count: change.changes.length } });
  return out;
}


import { useTranslation } from 'react-i18next';
import type { EventType } from '@opencpap/core';
import { formatClock } from '../../format';

export interface TimelineEvent { type: EventType; start: number; duration: number } // seconds
export type Gap = [start: number, end: number]; // seconds

export const EVENT_ORDER: EventType[] = ['obstructive', 'central', 'unclassified-apnea', 'hypopnea', 'rera', 'flow-limitation', 'vibratory-snore', 'snore', 'periodic-breathing', 'variable-breathing', 'large-leak'];
/** One fixed colour per event type (categorical series, validated); rows are also labelled, so colour is never the only cue. */
export const EVENT_COLOR: Record<EventType, string> = {
  obstructive: 'var(--s-blue)', central: 'var(--s-violet)', hypopnea: 'var(--s-orange)', rera: 'var(--s-green)',
  'flow-limitation': 'var(--s-magenta)', 'vibratory-snore': 'var(--s-yellow)', 'periodic-breathing': 'var(--s-aqua)', 'large-leak': 'var(--s-red)',
  'unclassified-apnea': 'var(--s-red)', snore: 'var(--chart-muted)', 'variable-breathing': 'var(--chart-muted)',
};

/** Round clock ticks (every 5 min … 3 h, aligned to the wall clock) so the timeline lines up with the chart axes. */
export function niceTicks(min: number, max: number, target = 8): number[] {
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600];
  const span = Math.max(max - min, 1);
  const step = steps.find((s) => span / s <= target) ?? steps.at(-1)!;
  const out: number[] = [];
  for (let x = Math.ceil(min / step) * step; x <= max; x += step) out.push(x);
  return out;
}

interface Props { events: TimelineEvent[]; gaps: Gap[]; extent: [number, number]; range: [number, number] | null; cursor: number | null }

/**
 * Event rows over the shared time range. Positions are percentages, so no measuring is needed; the plot area is
 * inset by the same gutter and axis width as the charts (see styles.css) so every track lines up vertically.
 */
export function Timeline({ events, gaps, extent, range, cursor }: Props) {
  const { t, i18n } = useTranslation();
  const [min, max] = range ?? extent;
  const span = Math.max(max - min, 1);
  const pct = (x: number) => ((x - min) / span) * 100;
  const present = EVENT_ORDER.filter((type) => events.some((e) => e.type === type));
  const ticks = niceTicks(min, max);
  const cursorPct = cursor === null ? null : pct(cursor);

  return (
    <div className="timeline" role="group" aria-label={t('night.timeline')}>
      {present.map((type) => {
        const all = events.filter((e) => e.type === type);
        const rows = all.filter((e) => e.start + e.duration >= min && e.start <= max);
        const color = EVENT_COLOR[type];
        return (
          <div className="timeline-row" key={type}>
            <span className="lab" title={t(`event.${type}`)}><i style={{ background: color }} />{t(`event.${type}`)} <b className="num">{all.length}</b></span>
            <div className="plot">
              <svg role="img" aria-label={`${t(`event.${type}`)}: ${rows.length}`} preserveAspectRatio="none">
                {ticks.map((x) => <line key={x} x1={`${pct(x)}%`} x2={`${pct(x)}%`} y1="0" y2="100%" stroke="var(--chart-grid)" strokeWidth="1" />)}
                {gaps.map(([a, b], i) => <rect key={i} x={`${pct(a)}%`} width={`${Math.max(pct(b) - pct(a), 0)}%`} y="0" height="100%" fill="var(--chart-band)" />)}
                {rows.map((e, i) => {
                  const w = (e.duration / span) * 100;
                  const tip = `${t(`event.${type}`)} ${formatClock(e.start * 1000, i18n.language)}${e.duration >= 1 ? ` (${Math.round(e.duration)} s)` : ''}`;
                  return w > 0.5
                    ? <rect key={i} x={`${pct(e.start)}%`} width={`${w}%`} y="4" height="calc(100% - 8px)" rx="2" fill={color} opacity="0.9"><title>{tip}</title></rect>
                    : <rect key={i} x={`${pct(e.start)}%`} width="3" y="2" height="calc(100% - 4px)" rx="1.5" fill={color}><title>{tip}</title></rect>;
                })}
              </svg>
              {cursorPct !== null && cursorPct >= 0 && cursorPct <= 100 && <div className="timeline-cursor" style={{ left: `${cursorPct}%` }} />}
            </div>
          </div>
        );
      })}
      <div className="timeline-axis" aria-hidden="true">
        <span />
        <div className="ticks">{ticks.map((x, i) => <span key={i} style={{ left: `${pct(x)}%` }}>{formatClock(x * 1000, i18n.language)}</span>)}</div>
      </div>
    </div>
  );
}

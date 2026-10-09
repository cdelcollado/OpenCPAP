import { useTranslation } from 'react-i18next';
import type { EventType } from '@opencpap/core';
import { formatClock } from '../../format';

export interface TimelineEvent { type: EventType; start: number; duration: number } // seconds
export type Gap = [start: number, end: number]; // seconds

const ORDER: EventType[] = ['obstructive', 'central', 'unclassified-apnea', 'hypopnea', 'rera', 'flow-limitation', 'vibratory-snore', 'snore', 'periodic-breathing', 'variable-breathing', 'large-leak'];
const COLOR: Partial<Record<EventType, string>> = {
  obstructive: 'var(--bad)', central: 'var(--chart-4)', hypopnea: 'var(--chart-2)', rera: 'var(--chart-3)', 'unclassified-apnea': 'var(--bad)',
};

/** Event rows over a shared time range. Positions are percentages, so it needs no measuring and scales with its container. */
export function Timeline({ events, gaps, extent, range }: { events: TimelineEvent[]; gaps: Gap[]; extent: [number, number]; range: [number, number] | null }) {
  const { t, i18n } = useTranslation();
  const [min, max] = range ?? extent;
  const span = Math.max(max - min, 1);
  const pct = (x: number) => ((x - min) / span) * 100;
  const present = ORDER.filter((type) => events.some((e) => e.type === type));
  const ticks = Array.from({ length: 7 }, (_, i) => min + (span * i) / 6);

  return (
    <div className="timeline" role="group" aria-label={t('night.timeline')}>
      {present.map((type) => {
        const rows = events.filter((e) => e.type === type && e.start + e.duration >= min && e.start <= max);
        return (
          <div className="timeline-row" key={type}>
            <span className="lab" title={t(`event.${type}`)}>{t(`event.${type}`)} ({events.filter((e) => e.type === type).length})</span>
            <svg role="img" aria-label={`${t(`event.${type}`)}: ${rows.length}`} preserveAspectRatio="none">
              {gaps.map(([a, b], i) => <rect key={i} x={`${pct(a)}%`} width={`${Math.max(pct(b) - pct(a), 0)}%`} y="0" height="100%" fill="var(--chart-band)" />)}
              {rows.map((e, i) => {
                const color = COLOR[type] ?? 'var(--text-muted)';
                const w = (e.duration / span) * 100;
                return w > 0.4
                  ? <rect key={i} x={`${pct(e.start)}%`} width={`${w}%`} y="4" height="calc(100% - 8px)" fill={color} opacity="0.85"><title>{`${t(`event.${type}`)} ${formatClock(e.start * 1000, i18n.language)} (${Math.round(e.duration)} s)`}</title></rect>
                  : <rect key={i} x={`${pct(e.start)}%`} width="2" y="2" height="calc(100% - 4px)" fill={color}><title>{`${t(`event.${type}`)} ${formatClock(e.start * 1000, i18n.language)}`}</title></rect>;
              })}
            </svg>
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

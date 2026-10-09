import { addDays, daysBetween } from '@opencpap/core';
import { formatNightDate } from '../../format';

export interface DayPoint { date: string; value: number | null }

const W = 700, H = 150, L = 38, R = 8, T = 10, B = 22;

/** A "nice" top for the y axis so ticks read as round numbers. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * mag) return m * mag;
  return 10 * mag;
}

interface Props {
  points: DayPoint[];
  from: string;
  to: string;
  color: string;
  kind: 'bars' | 'line';
  label: string;
  unit: string;
  lang: string;
  reference?: number;
  markers?: string[];
}

/**
 * Static SVG chart for the printable report: no canvas and no scripts, so it prints crisply and stays selectable text.
 * Days with no data are left empty so gaps are visible.
 */
export function SvgChart({ points, from, to, color, kind, label, unit, lang, reference, markers = [] }: Props) {
  const days = Math.max(1, daysBetween(from, to) + 1);
  const max = niceMax(Math.max(...points.map((p) => p.value ?? 0), reference ?? 0) * 1.05);
  const x = (date: string) => L + ((daysBetween(from, date) + 0.5) / days) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const slot = (W - L - R) / days;
  const ticks = [0, max / 2, max];
  const xTicks = Array.from({ length: Math.min(5, days) }, (_, i) => addDays(from, Math.round((i * (days - 1)) / Math.max(Math.min(5, days) - 1, 1))));
  const fmt = (v: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(v);
  const defined = points.filter((p) => p.value !== null) as { date: string; value: number }[];

  let path = '';
  if (kind === 'line') {
    let prev: string | null = null;
    for (const p of defined) {
      path += `${prev !== null && daysBetween(prev, p.date) === 1 ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`;
      prev = p.date;
    }
  }

  return (
    <figure className="svg-chart">
      <figcaption>{label} <span className="muted">({unit})</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${unit}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--chart-text)">{fmt(v)}</text>
          </g>
        ))}
        {xTicks.map((d) => <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--chart-text)">{formatNightDate(d, lang, 'short')}</text>)}
        {kind === 'bars' && defined.map((p) => {
          const bw = Math.min(16, slot * 0.7), h = Math.max(0, (H - B) - y(p.value));
          return <rect key={p.date} x={x(p.date) - bw / 2} y={y(p.value)} width={bw} height={h} rx={Math.min(3, bw / 3)} fill={color}><title>{`${formatNightDate(p.date, lang)}: ${fmt(p.value)} ${unit}`}</title></rect>;
        })}
        {kind === 'line' && <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {kind === 'line' && defined.length <= 90 && defined.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="2.5" fill={color} stroke="var(--surface)" strokeWidth="1"><title>{`${formatNightDate(p.date, lang)}: ${fmt(p.value)} ${unit}`}</title></circle>)}
        {reference !== undefined && <line x1={L} x2={W - R} y1={y(reference)} y2={y(reference)} stroke="var(--chart-text)" strokeWidth="1" strokeDasharray="5 4" />}
        {markers.filter((d) => d >= from && d <= to).map((d) => (
          <g key={d}><line x1={x(d) - slot / 2} x2={x(d) - slot / 2} y1={T} y2={H - B} stroke="var(--chart-text)" strokeWidth="1.2" strokeDasharray="3 3" /><path d={`M${x(d) - slot / 2 - 4} ${T} h8 l-4 6z`} fill="var(--chart-text)" /></g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--chart-axis)" strokeWidth="1" />
      </svg>
    </figure>
  );
}

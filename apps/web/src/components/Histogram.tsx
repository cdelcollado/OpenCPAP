import { formatNumber } from '../format';

interface Props { counts: number[]; labels: string[]; color: string; label: string; lang: string }

const W = 520, H = 150, L = 30, R = 6, T = 8, B = 30;

/** Bar histogram as inline SVG. Every bar has a title with its range and count; the figure has an accessible name. */
export function Histogram({ counts, labels, color, label, lang }: Props) {
  const max = Math.max(1, ...counts);
  const slot = (W - L - R) / counts.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${counts.map((c, i) => `${labels[i]} ${c}`).join(', ')}`} className="histogram">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
          <text x={L - 4} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--chart-text)">{formatNumber(v, lang, 0)}</text>
        </g>
      ))}
      {counts.map((c, i) => {
        const bw = Math.min(28, slot * 0.7), x = L + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={y(c)} width={bw} height={Math.max(0, H - B - y(c))} rx={Math.min(3, bw / 4)} fill={color}><title>{`${labels[i]}: ${c}`}</title></rect>
            <text x={x + bw / 2} y={H - 14} textAnchor="middle" fontSize="10" fill="var(--chart-text)">{labels[i]}</text>
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--chart-axis)" strokeWidth="1" />
    </svg>
  );
}

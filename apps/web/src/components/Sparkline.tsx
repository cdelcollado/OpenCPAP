/** Tiny trend line for stat tiles: 2 px line, soft area wash, end dot with a surface ring. Missing values leave gaps. */
export function Sparkline({ values, color, label, guide }: { values: (number | null | undefined)[]; color: string; label: string; guide?: number }) {
  const pts = values.map((v, i) => (v == null || Number.isNaN(v) ? null : ([i, v] as const)));
  const defined = pts.filter((p): p is readonly [number, number] => p !== null);
  if (defined.length < 2) return null;
  const W = 200, H = 36, pad = 4;
  const ys = defined.map((p) => p[1]);
  const lo = Math.min(...ys, 0), hi = Math.max(...ys, lo + 1e-9);
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  let d = '';
  let area = '';
  let run: (readonly [number, number])[] = [];
  const flush = () => {
    if (run.length === 0) return;
    d += run.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
    if (run.length > 1) area += `M${x(run[0]![0]).toFixed(1)} ${H - pad}${run.map((p) => `L${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('')}L${x(run.at(-1)![0]).toFixed(1)} ${H - pad}Z`;
    run = [];
  };
  for (const p of pts) { if (p) run.push(p); else flush(); }
  flush();
  const last = defined.at(-1)!;
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {guide !== undefined && guide >= lo && guide <= hi && <line x1={pad} x2={W - pad} y1={y(guide)} y2={y(guide)} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        <path d={area} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(last[0])} cy={y(last[1])} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

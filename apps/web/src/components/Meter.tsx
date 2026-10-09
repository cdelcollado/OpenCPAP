/** Horizontal progress track with an optional target marker (e.g. the 70 % compliance line). */
export function Meter({ ratio, target, label }: { ratio: number; target?: number; label: string }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="meter" role="img" aria-label={label}>
      <div className="fill" style={{ width: `${pct}%` }} />
      {target !== undefined && <div className="mark" style={{ left: `${target * 100}%` }} />}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartColors { c1: string; c2: string; c3: string; c4: string; grid: string; text: string; band: string }

/** Re-render charts when the theme changes (they are canvases and cannot follow CSS variables by themselves). */
function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    window.addEventListener('opencpap:theme', bump);
    return () => { mq.removeEventListener('change', bump); window.removeEventListener('opencpap:theme', bump); };
  }, []);
  return v;
}

export function readColors(): ChartColors {
  const css = getComputedStyle(document.documentElement);
  const g = (n: string) => css.getPropertyValue(n).trim();
  return { c1: g('--chart-1'), c2: g('--chart-2'), c3: g('--chart-3'), c4: g('--chart-4'), grid: g('--chart-grid'), text: g('--chart-text'), band: g('--chart-band') };
}

export type XRange = [min: number, max: number];

interface Props {
  /** Builds the uPlot options (without size). Must be memoised by the caller; a new function rebuilds the chart. */
  options: (colors: ChartColors) => Omit<uPlot.Options, 'width' | 'height'>;
  data: uPlot.AlignedData;
  height?: number;
  ariaLabel: string;
  /** Shared x range (seconds). `null` = full extent. */
  range?: XRange | null;
  onRangeChange?: (r: XRange | null) => void;
  /** Crosshair sync group. */
  syncKey?: string;
}

/** Thin React wrapper around uPlot: resize-aware, theme-aware, zoom-syncable. */
export function Chart({ options, data, height = 220, ariaLabel, range, onRangeChange, syncKey }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const applying = useRef(false);
  const onRange = useRef(onRangeChange);
  onRange.current = onRangeChange;
  const dataRef = useRef(data);
  dataRef.current = data;
  const theme = useThemeVersion();

  const extent = useMemo<XRange | null>(() => {
    const xs = data[0];
    return xs && xs.length ? [Number(xs[0]), Number(xs[xs.length - 1])] : null;
  }, [data]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const base = options(readColors());
    const opts: uPlot.Options = {
      ...base,
      width: Math.max(el.clientWidth, 200),
      height,
      cursor: { ...(base.cursor ?? {}), sync: syncKey ? { key: syncKey } : undefined, drag: { x: true, y: false, setScale: true } },
      hooks: {
        ...(base.hooks ?? {}),
        setScale: [
          ...((base.hooks?.setScale as uPlot.Hooks.Defs['setScale'][]) ?? []),
          (u, key) => {
            if (key !== 'x' || applying.current) return;
            const { min, max } = u.scales.x!;
            if (min == null || max == null) return;
            const xs = dataRef.current[0];
            const full = xs && xs.length ? [Number(xs[0]), Number(xs[xs.length - 1])] : null;
            const isFull = !full || (Math.abs(min - full[0]!) < 1e-6 && Math.abs(max - full[1]!) < 1e-6);
            onRange.current?.(isFull ? null : [min, max]);
          },
        ],
      },
    };
    const u = new uPlot(opts, dataRef.current, el);
    plot.current = u;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', ariaLabel);
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(el.clientWidth, 200), height }));
    ro.observe(el);
    return () => { ro.disconnect(); u.destroy(); plot.current = null; };
  }, [options, height, ariaLabel, syncKey, theme]);

  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    applying.current = true;
    u.setData(data, true);
    applying.current = false;
  }, [data]);

  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    const target = range ?? extent;
    if (!target) return;
    const { min, max } = u.scales.x!;
    if (min != null && max != null && Math.abs(min - target[0]) < 1e-6 && Math.abs(max - target[1]) < 1e-6) return;
    applying.current = true;
    u.setScale('x', { min: target[0], max: target[1] });
    applying.current = false;
  }, [range, extent, options, theme]);

  return <div ref={host} className="chart-box" />;
}

/** Axis style shared by all charts. */
export const axisStyle = (c: ChartColors): uPlot.Axis => ({ stroke: c.text, grid: { stroke: c.grid, width: 1 }, ticks: { stroke: c.grid, width: 1 } });
/** Wall-clock time axis: timestamps are device time encoded as UTC. */
export const utcDate = (ts: number) => uPlot.tzDate(new Date(ts * 1000), 'UTC');
export { uPlot };

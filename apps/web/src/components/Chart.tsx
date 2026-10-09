import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

/** Colours read from the design tokens at render time (canvas cannot follow CSS variables by itself). */
export interface ChartColors {
  grid: string; axis: string; text: string; muted: string; band: string; surface: string; surface2: string;
  usage: string; ahi: string; leak: string; pressure: string; flow: string; snore: string; flat: string; rate: string; spo2: string; pulse: string;
  /** categorical series, fixed order: blue, orange, aqua, yellow, magenta, green, violet, red */
  series: string[];
}

/** Bumps whenever the theme changes so canvases and computed colours can be rebuilt. */
export function useThemeVersion() {
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
  return {
    grid: g('--chart-grid'), axis: g('--chart-axis'), text: g('--chart-text'), muted: g('--chart-muted'), band: g('--chart-band'), surface: g('--surface'), surface2: g('--surface-2'),
    usage: g('--m-usage'), ahi: g('--m-ahi'), leak: g('--m-leak'), pressure: g('--m-pressure'), flow: g('--m-flow'), snore: g('--m-snore'), flat: g('--m-flat'), rate: g('--m-rate'), spo2: g('--m-spo2'), pulse: g('--m-pulse'),
    series: ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'].map((n) => g(`--s-${n}`)),
  };
}

/** Plot-area geometry shared with the HTML timeline so tracks line up (see styles.css --axis). */
export function readAxisWidth(): number {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis'), 10);
  return Number.isFinite(v) ? v : 52;
}
export const PLOT_PAD_RIGHT = 14;

export type XRange = [min: number, max: number];

interface Props {
  /** Builds the uPlot options (without size). Must be memoised by the caller; a new function rebuilds the chart. */
  options: (colors: ChartColors) => Omit<uPlot.Options, 'width' | 'height'>;
  data: uPlot.AlignedData;
  height?: number;
  ariaLabel: string;
  /** Full extent of the x axis (seconds). Defaults to the data extent; set it to align several charts. */
  domain?: XRange | null;
  /** Shared zoomed range (seconds). `null` = full extent. */
  range?: XRange | null;
  onRangeChange?: (r: XRange | null) => void;
  /** Crosshair sync group (charts with the same key move together). */
  syncKey?: string;
  /** Allow zooming by dragging. Default true. */
  zoom?: boolean;
  /** Pointer position as an x value (seconds), or null when the pointer leaves. */
  onCursor?: (x: number | null) => void;
  /** Click on the plot: index of the nearest data point. */
  onPointClick?: (index: number) => void;
}

/** Thin React wrapper around uPlot: resize-aware, theme-aware, zoom-syncable. */
export function Chart({ options, data, height = 220, ariaLabel, domain, range, onRangeChange, syncKey, zoom = true, onCursor, onPointClick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const applying = useRef(false);
  const cb = useRef({ onRangeChange, onCursor, onPointClick });
  cb.current = { onRangeChange, onCursor, onPointClick };
  const dataRef = useRef(data);
  dataRef.current = data;
  const fullRef = useRef<XRange | null>(null);
  const rangeRef = useRef<XRange | null | undefined>(range);
  rangeRef.current = range;
  const theme = useThemeVersion();

  const dataExtent = useMemo<XRange | null>(() => {
    const xs = data[0];
    return xs && xs.length ? [Number(xs[0]), Number(xs[xs.length - 1])] : null;
  }, [data]);
  const full = domain ?? dataExtent;
  fullRef.current = full;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const base = options(readColors());
    const opts: uPlot.Options = {
      ...base,
      width: Math.max(el.clientWidth, 200),
      height,
      cursor: { ...(base.cursor ?? {}), y: false, sync: syncKey ? { key: syncKey } : undefined, drag: { x: zoom, y: false, setScale: zoom }, points: { show: false } },
      hooks: {
        ...(base.hooks ?? {}),
        setScale: [
          ...((base.hooks?.setScale as uPlot.Hooks.Defs['setScale'][]) ?? []),
          (u, key) => {
            if (key !== 'x' || applying.current) return;
            const { min, max } = u.scales.x!;
            if (min == null || max == null) return;
            const f = fullRef.current;
            const isFull = !f || (Math.abs(min - f[0]) < 1e-6 && Math.abs(max - f[1]) < 1e-6);
            // do not echo back a range the parent already holds: with several linked charts that can ping-pong forever
            const cur = rangeRef.current;
            const same = isFull ? cur == null : cur != null && Math.abs(cur[0] - min) < 1e-3 && Math.abs(cur[1] - max) < 1e-3;
            if (same) return;
            cb.current.onRangeChange?.(isFull ? null : [min, max]);
          },
        ],
        setCursor: [
          ...((base.hooks?.setCursor as uPlot.Hooks.Defs['setCursor'][]) ?? []),
          (u) => {
            if (!cb.current.onCursor) return;
            const left = u.cursor.left;
            cb.current.onCursor(left != null && left >= 0 ? u.posToVal(left, 'x') : null);
          },
        ],
        ready: [
          ...((base.hooks?.ready as uPlot.Hooks.Defs['ready'][]) ?? []),
          (u) => {
            u.over.addEventListener('click', () => {
              const i = u.cursor.idx;
              if (i != null && cb.current.onPointClick) cb.current.onPointClick(i);
            });
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
  }, [options, height, ariaLabel, syncKey, zoom, theme]);

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
    const target = range ?? full;
    if (!target) return;
    const { min, max } = u.scales.x!;
    if (min != null && max != null && Math.abs(min - target[0]) < 1e-6 && Math.abs(max - target[1]) < 1e-6) return;
    applying.current = true;
    u.setScale('x', { min: target[0], max: target[1] });
    applying.current = false;
  }, [range, full?.[0], full?.[1], options, theme]);

  return <div ref={host} className="chart-box" />;
}

/** Axis style shared by all charts: hairline, solid, recessive. */
export const axisStyle = (c: ChartColors): uPlot.Axis => ({ stroke: c.text, grid: { stroke: c.grid, width: 1 }, ticks: { stroke: c.axis, width: 1 }, border: { stroke: c.axis, width: 1 } });
/** Wall-clock time axis: timestamps are device time encoded as UTC. */
export const utcDate = (ts: number) => uPlot.tzDate(new Date(ts * 1000), 'UTC');
export { uPlot };

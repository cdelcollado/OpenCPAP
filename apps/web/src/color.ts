/** Small colour helpers for the calendar heatmap (cells are coloured in JS so their label contrast can be chosen). */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Linear mix of two hex colours; t = share of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [parseHex(a), parseHex(b)];
  const k = Math.max(0, Math.min(1, t));
  return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Black or white ink, whichever reads better on the background. */
export function inkFor(background: string): '#0b1217' | '#ffffff' {
  return contrast(background, '#ffffff') >= contrast(background, '#0b1217') ? '#ffffff' : '#0b1217';
}

export interface RampStep { bg: string; ink: string; /** share of the hue mixed into the surface colour */ share: number }

/**
 * A discrete sequential ramp (one hue, light → strong) for heatmaps. Every step is nudged along the ramp until one of
 * the two inks reaches `minContrast`, so a number printed inside a cell is always readable, and steps stay strictly ordered.
 */
export function heatRamp(surface: string, hue: string, bins = 6, minContrast = 4.5, first = 0.14): RampStep[] {
  const out: RampStep[] = [];
  // On a light surface the validated hues are mid tones that fit neither ink well; the strong end of the ramp is the
  // same hue darkened. On a dark surface the hue itself is light enough for dark ink.
  const end = luminance(surface) > 0.5 ? mixHex(hue, '#000000', 0.35) : hue;
  let prev = first - 0.06;
  for (let k = 0; k < bins; k++) {
    let share = Math.max(prev + 0.06, first + ((1 - first) * k) / Math.max(bins - 1, 1));
    const fit = (s: number) => { const bg = mixHex(surface, end, s); const ink = inkFor(bg); return { bg, ink, c: contrast(bg, ink) }; };
    let cur = fit(share);
    while (cur.c < minContrast && share < 1) { share = Math.min(1, share + 0.01); cur = fit(share); }
    out.push({ bg: cur.bg, ink: cur.ink, share });
    prev = share;
  }
  return out;
}

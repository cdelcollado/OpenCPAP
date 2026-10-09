/** Rolling mean over the last `window` entries that have a value (including the current one); undefined until `minCount` values exist. */
export function rollingMean(values: (number | undefined | null)[], window: number, minCount = 3): (number | undefined)[] {
  const recent: number[] = [];
  return values.map((v) => {
    if (v !== undefined && v !== null && !Number.isNaN(v)) { recent.push(v); if (recent.length > window) recent.shift(); }
    return recent.length >= minCount ? recent.reduce((a, b) => a + b, 0) / recent.length : undefined;
  });
}

export interface Histogram {
  /** bin edges, length = counts.length + 1; the last bin includes values at or above the final edge */
  edges: number[];
  counts: number[];
  total: number;
}

/**
 * Counts values into bins. Values below the first edge go to the first bin and values at or above the last edge to
 * the last, so nothing is silently dropped.
 */
export function histogram(values: (number | undefined | null)[], edges: number[]): Histogram {
  const counts = new Array<number>(edges.length - 1).fill(0);
  let total = 0;
  for (const v of values) {
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    let i = edges.findIndex((e, k) => k > 0 && v < e) - 1;
    if (i < -1) i = -1;
    if (i === -1) i = v < edges[0]! ? 0 : counts.length - 1;
    counts[i]!++;
    total++;
  }
  return { edges, counts, total };
}

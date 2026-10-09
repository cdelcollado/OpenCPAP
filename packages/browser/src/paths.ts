/**
 * Folders that mark the root of a CPAP SD card (upper-case). Users may select the card root, its parent,
 * or the marker folder itself, so every source normalizes paths to be relative to the marker's parent.
 * Add the marker of each new device family here.
 */
export const ROOT_MARKERS = ['P-SERIES', 'DATALOG'];

/** Converts separators and drops empty/'.' segments. */
export function cleanPath(path: string): string {
  return path.split(/[\\/]+/).filter((s) => s && s !== '.').join('/');
}

/**
 * Re-roots paths so the first segment is a marker folder. Paths that contain no marker are dropped,
 * which also keeps unrelated card content (photos, documents) out of the virtual file system.
 */
export function rerootPaths(paths: Iterable<[path: string, ref: string]>, markers: readonly string[] = ROOT_MARKERS) {
  const out = new Map<string, string>(); // normalized path -> original reference
  const upper = markers.map((m) => m.toUpperCase());
  for (const [p, ref] of paths) {
    const segs = cleanPath(p).split('/');
    // Only look at the first few levels: a marker deeper than that is not a card root.
    const i = segs.findIndex((s, idx) => idx < 3 && upper.includes(s.toUpperCase()));
    if (i < 0 || i === segs.length - 1) continue;
    out.set(segs.slice(i).join('/'), ref);
  }
  return out;
}

export function isMarker(name: string, markers: readonly string[] = ROOT_MARKERS): boolean {
  return markers.some((m) => m.toUpperCase() === name.toUpperCase());
}

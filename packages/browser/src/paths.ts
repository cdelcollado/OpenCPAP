/**
 * Folders that mark the root of a CPAP SD card (upper-case). Users may select the card root, its parent,
 * or the marker folder itself, so every source normalizes paths to be relative to the marker's parent.
 * Add the marker of each new device family here.
 */
export const ROOT_MARKERS = ['P-SERIES', 'DATALOG'];

/**
 * Files that sit next to a marker folder at the card root and that a loader needs (ResMed keeps the daily summary
 * with the settings and the device identity there). They are kept only when they share the root with a marker folder.
 */
export const ROOT_FILES = ['STR.edf', 'Identification.tgt', 'Identification.json'];

/** Converts separators and drops empty/'.' segments. */
export function cleanPath(path: string): string {
  return path.split(/[\\/]+/).filter((s) => s && s !== '.').join('/');
}

/**
 * Re-roots paths so the first segment is a marker folder. Paths that contain no marker are dropped,
 * which also keeps unrelated card content (photos, documents) out of the virtual file system.
 */
export function rerootPaths(paths: Iterable<[path: string, ref: string]>, markers: readonly string[] = ROOT_MARKERS, rootFiles: readonly string[] = ROOT_FILES) {
  const out = new Map<string, string>(); // normalized path -> original reference
  const upper = markers.map((m) => m.toUpperCase());
  const rootsUpper = rootFiles.map((f) => f.toUpperCase());
  const roots = new Set<string>(); // prefixes (path before the marker) of every card root found
  const all = [...paths];
  for (const [p, ref] of all) {
    const segs = cleanPath(p).split('/');
    // Only look at the first few levels: a marker deeper than that is not a card root.
    const i = segs.findIndex((s, idx) => idx < 3 && upper.includes(s.toUpperCase()));
    if (i < 0 || i === segs.length - 1) continue;
    roots.add(segs.slice(0, i).join('/'));
    out.set(segs.slice(i).join('/'), ref);
  }
  for (const [p, ref] of all) {
    const segs = cleanPath(p).split('/');
    const name = segs.at(-1)!;
    if (segs.length > 3 || !rootsUpper.includes(name.toUpperCase())) continue;
    if (roots.has(segs.slice(0, -1).join('/'))) out.set(name, ref);
  }
  return out;
}

export function isMarker(name: string, markers: readonly string[] = ROOT_MARKERS): boolean {
  return markers.some((m) => m.toUpperCase() === name.toUpperCase());
}

export function isRootFile(name: string, rootFiles: readonly string[] = ROOT_FILES): boolean {
  return rootFiles.some((f) => f.toUpperCase() === name.toUpperCase());
}

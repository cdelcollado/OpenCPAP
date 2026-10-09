import { describe, it, expect } from 'vitest';
import { cleanPath, rerootPaths } from './paths';

const reroot = (paths: string[]) => [...rerootPaths(paths.map((p) => [p, p] as [string, string])).keys()];

describe('rerootPaths', () => {
  it('keeps paths when the marker folder is the root', () => {
    expect(reroot(['P-SERIES/DEV/PROP.BIN'])).toEqual(['P-SERIES/DEV/PROP.BIN']);
  });
  it('strips the name of the selected card folder', () => {
    expect(reroot(['NO NAME/P-SERIES/DEV/PROP.BIN', 'NO NAME/photos/a.jpg'])).toEqual(['P-SERIES/DEV/PROP.BIN']);
  });
  it('strips two levels (card inside another folder)', () => {
    expect(reroot(['backup/card1/P-SERIES/DEV/a'])).toEqual(['P-SERIES/DEV/a']);
  });
  it('matches the marker case-insensitively and keeps the card spelling', () => {
    expect(reroot(['x/p-series/DEV/a'])).toEqual(['p-series/DEV/a']);
  });
  it('drops files without a marker and markers that are the file itself', () => {
    expect(reroot(['a/b.txt', 'P-SERIES'])).toEqual([]);
  });
  it('ignores markers nested deeper than three levels', () => {
    expect(reroot(['a/b/c/P-SERIES/x'])).toEqual([]);
  });
});

describe('cleanPath', () => {
  it('normalizes separators', () => expect(cleanPath('.\\P-SERIES//DEV\\a')).toBe('P-SERIES/DEV/a'));
});

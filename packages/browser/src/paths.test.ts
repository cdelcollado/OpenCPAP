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

describe('rerootPaths: root files', () => {
  it('keeps device files that sit next to a marker folder', () => {
    expect(reroot(['SD/DATALOG/20260101/a.edf', 'SD/STR.edf', 'SD/Identification.tgt', 'SD/photos/STR.edf', 'SD/other.txt']).sort())
      .toEqual(['DATALOG/20260101/a.edf', 'Identification.tgt', 'STR.edf']);
  });
  it('drops them when no marker folder shares their root', () => {
    expect(reroot(['SD/STR.edf', 'elsewhere/DATALOG/x/a.edf'])).toEqual(['DATALOG/x/a.edf']);
  });
  it('works when the card root is the selected folder itself', () => {
    expect(reroot(['STR.edf', 'DATALOG/x/a.edf']).sort()).toEqual(['DATALOG/x/a.edf', 'STR.edf']);
  });
});

describe('cleanPath', () => {
  it('normalizes separators', () => expect(cleanPath('.\\P-SERIES//DEV\\a')).toBe('P-SERIES/DEV/a'));
});

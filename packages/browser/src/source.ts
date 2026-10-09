import type { VirtualFS } from '@opencpap/core';
import { DirectoryHandleFS, type DirEntry } from './directoryHandleFs';
import { FileListFS } from './fileListFs';
import { ZipFS } from './zipFs';

/**
 * Where the card data comes from. All variants are structured-cloneable, so they can be posted to a Web Worker.
 * - `files`: `<input webkitdirectory>` or drag & drop (every browser)
 * - `directory`: `showDirectoryPicker()` handle (Chromium)
 * - `zip`: a ZIP of the card or of its P-SERIES folder
 */
export type CardSource =
  | { kind: 'files'; files: File[] }
  | { kind: 'directory'; handle: DirEntry }
  | { kind: 'zip'; file: Blob };

export async function createFs(source: CardSource): Promise<VirtualFS> {
  switch (source.kind) {
    case 'files': return new FileListFS(source.files);
    case 'directory': return new DirectoryHandleFS(source.handle);
    case 'zip': return new ZipFS(new Uint8Array(await source.file.arrayBuffer()));
  }
}

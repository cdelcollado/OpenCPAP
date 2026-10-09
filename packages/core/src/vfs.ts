/** Abstraction of the SD card root (File System Access, FileList, ZIP, or in-memory in tests). */
export interface VirtualFS {
  /** Paths relative to the card root, using '/' as separator. */
  list(prefix?: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
}

export class MemoryFS implements VirtualFS {
  constructor(private files: Map<string, Uint8Array>) {}
  async list(prefix = '') {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`File not found: ${path}`);
    return f;
  }
  async exists(path: string) {
    return this.files.has(path);
  }
}

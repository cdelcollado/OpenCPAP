/** Abstracció de la carpeta de la SD (File System Access, FileList, ZIP o disc en tests). */
export interface VirtualFS {
  /** Rutes relatives a l'arrel de la SD, amb '/' com a separador. */
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
    if (!f) throw new Error(`No existeix: ${path}`);
    return f;
  }
  async exists(path: string) {
    return this.files.has(path);
  }
}

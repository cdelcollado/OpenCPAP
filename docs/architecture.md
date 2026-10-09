# Architecture

## Goals
1. Read CPAP SD card data entirely in the browser (no server required).
2. Support many devices through plugins that emit one canonical model.
3. Handle large waveform data (25 Hz × 8 h × years) without blocking the UI.
4. Be testable in Node with synthetic fixtures.

## Packages

| Package | Responsibility |
|---|---|
| `@opencpap/core` | Canonical model (`model.ts`), `VirtualFS` abstraction (`vfs.ts`), `DeviceLoader` interface (`loader.ts`). No device-specific code, no DOM dependencies. |
| `@opencpap/loader-philips-ds2` | DS2 loader. Layers, bottom-up: `container.ts` (decrypt) → `chunk.ts` + `crc.ts` (framing, integrity) → `summary.ts` / `events.ts` / `waveform.ts` (record decoders) → `index.ts` (session assembly, `DeviceLoader`). `device.ts` reads `PROP.BIN`. `testing/` holds synthetic builders and a Node `VirtualFS` used only by tests. |
| `apps/web` (planned) | React + Vite PWA: import, storage, charts, reports. |

Planned: `packages/loaders/resmed`, `packages/ui-charts`, further loaders.

## Data flow

```
SD card folder / ZIP
        │  (File System Access API | <input webkitdirectory> | ZIP)
        ▼
   VirtualFS ──► DeviceLoader.detect() picks the loader
        │
        ▼
   DeviceLoader.load()  (Web Worker)  ──► AsyncIterable<Session>
        │
        ▼
   Canonical model ──► local storage (IndexedDB / SQLite-WASM)
        │
        ▼
   Analytics (stats, DSP)  ──►  UI (dashboard, daily view, reports)
```

## Key abstractions

### `VirtualFS`
Read-only view of the SD card root: `list(prefix)`, `read(path)`, `exists(path)`. Paths are relative with `/` separators. Implementations: `MemoryFS` (tests); browser implementations planned (File System Access, FileList, ZIP). Loaders must not assume case: real cards show `P-SERIES`, `P-Series` and `p-series` (per OSCAR).

### `DeviceLoader`
```ts
interface DeviceLoader {
  id: string;
  detect(fs: VirtualFS): Promise<DetectResult | null>;
  load(fs: VirtualFS, onProgress?: Progress): AsyncIterable<Session>;
}
```
`detect` must be cheap (directory listing only). `load` streams sessions so the UI can show progress and memory stays bounded.

## Technology choices

See `docs/decisions/` for rationale. Summary: TypeScript strict, npm workspaces, Vitest, `@noble/ciphers` + `@noble/hashes` for crypto (audited, pure JS, works in browser and Node), planned React/Vite, uPlot for waveforms, IndexedDB/SQLite-WASM for storage.

## Cross-cutting concerns
- **Time:** all timestamps in the model are UTC epoch milliseconds. Devices store local or UTC seconds depending on the format; each loader normalizes and documents this in its format doc.
- **Performance:** parsing runs in Web Workers; waveforms are `Float32Array`; the UI will decimate on zoom.
- **Privacy:** see [privacy-and-security.md](privacy-and-security.md).

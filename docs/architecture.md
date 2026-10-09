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
| `@opencpap/loader-resmed` | ResMed loader. `identification.ts` (`Identification.tgt` / `.json`), `str.ts` (`STR.edf` daily settings and summary), `index.ts` (file discovery, grouping files into sessions, EDF+ signals and annotations → canonical model). Reads EDF through `readEdf` in core. `testing/` builds synthetic cards. See [formats/resmed.md](formats/resmed.md). |
| `@opencpap/browser` | Card sources (`FileListFS`, `DirectoryHandleFS`, `ZipFS`), path re-rooting, import pipeline (`runImport`), Web Worker entry and client (`importCard`). See [browser-import.md](browser-import.md). |
| `apps/web` (planned) | React + Vite PWA: import, storage, charts, reports. |

Planned: `packages/ui-charts`, further loaders ([devices.md](devices.md), [adding-a-device.md](adding-a-device.md)). Every loader's output is checked by the shared `checkSessions` conformance suite in core.

## Data flow

```
SD card folder / ZIP
        │  (File System Access API | <input webkitdirectory> | ZIP)   — UI thread
        ▼
   CardSource ──postMessage──►  Web Worker
                                  │ VirtualFS (re-rooted at the marker folder)
                                  │ detectLoader() picks the DeviceLoader
                                  ▼
                         DeviceLoader.load() ──► AsyncIterable<Session> ──► UI thread
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
`detect` must be cheap (directory listing only) and specific: it must return `null` for cards of other families (e.g. the DS2 loader rejects older PRS1 cards that use unencrypted `.00n` files). `load` streams sessions so the UI can show progress and memory stays bounded.

## Technology choices

See `docs/decisions/` for rationale. Summary: TypeScript strict, npm workspaces, Vitest, `@noble/ciphers` + `@noble/hashes` for crypto (audited, pure JS, works in browser and Node), planned React/Vite, uPlot for waveforms, IndexedDB/SQLite-WASM for storage.

## Cross-cutting concerns
- **Time:** all timestamps in the model are UTC epoch milliseconds. Devices store local or UTC seconds depending on the format; each loader normalizes and documents this in its format doc.
- **Performance:** parsing runs in Web Workers; waveforms are `Float32Array`; the UI will decimate on zoom.
- **Privacy:** see [privacy-and-security.md](privacy-and-security.md).

## Sharing and optional network features (Phase 6)
Two small modules in `apps/web/src` are the only code that can produce data meant to leave the device, and both are user-initiated: `share.ts` (snapshot ⇄ URL fragment, optional AES-GCM) and `llm.ts` (prompt builder and one `fetch` to the address the user configured). Neither touches IndexedDB directly; they receive figures already computed by `@opencpap/core`. See [sharing.md](sharing.md), [llm-summaries.md](llm-summaries.md) and [ADR-0012](decisions/0012-phase6-design-choices.md).

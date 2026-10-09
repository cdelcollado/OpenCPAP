# Browser import

How card data gets from the user's SD card into the canonical model, entirely inside the browser. Implementation: `packages/browser` (`@opencpap/browser`) plus `loadCard`/`detectLoader` in `@opencpap/core`.

## Overview

```
 user action                  UI thread                         import worker
 ───────────                  ─────────                         ─────────────
 pick folder / drop files  →  CardSource  ──postMessage──►  createFs(source) → VirtualFS
 or choose a .zip                                              detectLoader() picks a DeviceLoader
                              importCard() ◄── detected ──      loader.load() streams sessions
                              (async iterator) ◄── progress ──
                                            ◄── session* ──   (typed arrays are transferred, not copied)
                                            ◄── done / error
```

Nothing is uploaded. The worker keeps decryption, CRC checks and parsing off the UI thread, so the page stays responsive while ~1 200 files are processed.

## Card sources

| `CardSource.kind` | Produced by | Browser support | Adapter |
|---|---|---|---|
| `files` | `<input type="file" webkitdirectory>` or drag & drop of a folder (paths from `File.webkitRelativePath`) | All modern browsers | `FileListFS` |
| `directory` | `window.showDirectoryPicker()` | Chromium (Chrome, Edge, Opera); not Firefox/Safari | `DirectoryHandleFS` |
| `zip` | a `.zip` of the card or of its `P-SERIES` folder | All modern browsers | `ZipFS` (uses `fflate`) |

Every variant is structured-cloneable, so it can be posted to the worker unchanged (`File`, `Blob` and `FileSystemDirectoryHandle` are cloneable).

### Path normalisation ("re-rooting")
Users select different things: the card root (`NO NAME/`), its parent, or the marker folder itself. All adapters normalise paths so that the first segment is a **marker folder** (`ROOT_MARKERS` in `paths.ts`: currently `P-SERIES` for Philips, `DATALOG` for ResMed). Rules:
- The marker is searched in the first three path segments, case-insensitively (cards show `P-SERIES`, `P-Series`, `p-series`); the card's own spelling is kept.
- Everything before the marker is dropped; files with no marker are ignored, which keeps photos or documents on the card out of the virtual file system.
- `DirectoryHandleFS` additionally walks **only** marker folders (searching up to two levels below the chosen directory), so a large card is not enumerated.
- **When adding a device family, add its root marker to `ROOT_MARKERS`.**

### Limits (defence against hostile input)
- Individual files above `MAX_FILE_BYTES` (256 MiB) are refused by all adapters; real card files are under 1 MB.
- `ZipFS` reads the central directory without decompressing, then decompresses **one entry at a time** on demand, and checks the declared uncompressed size before inflating (zip-bomb guard).
- Paths are never used to touch a real file system; they are only map keys.

## Orchestration
- `detectLoader(fs, loaders)` (core) runs every loader's cheap `detect` and returns the most confident match.
- `loadCard(fs, loaders, onProgress)` (core) detects and streams sessions; throws `UnsupportedCardError` if nothing matches.
- `runImport(source, loaders, post, isCancelled)` (browser) is the same pipeline with message posting; it has no Worker dependency so tests run it in Node.
- `worker.ts` is the worker entry. **Register new loaders in its `LOADERS` array.**
- `importCard(worker, source, callbacks)` (client) returns an `AsyncGenerator<Session>`; the worker is terminated when iteration ends, fails or is aborted.

### Message protocol (`protocol.ts`)
| Direction | Message |
|---|---|
| UI → worker | `{type:'import', source}`, `{type:'cancel'}` |
| worker → UI | `{type:'detected', manufacturer, model, loader}`, `{type:'progress', done, total}`, `{type:'session', session}`, `{type:'done', count}`, `{type:'error', name, message}` |

Errors keep their `name` (e.g. `UnsupportedCardError`) so the UI can show a specific message. Sessions are posted with their waveform/statistics `ArrayBuffer`s in the transfer list (`sessionBuffers`).

### Cancellation
`importCard(..., {signal})`: if the signal is already aborted nothing starts; if it aborts during the import, a `cancel` message is sent, the worker stops after the current session, and the worker is terminated.

## Usage sketch (for the web app, Phase 2)
```ts
import { importCard, createImportWorker } from '@opencpap/browser';

// Chromium: const handle = await window.showDirectoryPicker();  source = { kind: 'directory', handle }
// Any browser: <input webkitdirectory>        source = { kind: 'files', files: [...input.files] }
// ZIP:                                        source = { kind: 'zip', file }
for await (const session of importCard(createImportWorker(), source, {
  onDetected: (d) => console.log(d.model),
  onProgress: (done, total) => setProgress(done / total),
  signal: abortController.signal,
})) {
  await store.save(session);   // Phase 2: local database
}
```

## Verification
- `paths.test.ts`: re-rooting rules.
- `fs.test.ts`: 8 source variants (card root / marker folder / parent folder / extra files / zip with and without folder name) each list, read and load a synthetic card identically.
- `worker.test.ts`: protocol with an in-process fake worker that clones messages like a real one (including transferred typed arrays); unsupported card, corrupt data, pre-aborted and mid-import cancellation.
- `real-card.test.ts` (needs `fixtures/raw`): `FileListFS`, `DirectoryHandleFS` and `ZipFS` produce identical fingerprints for all 550 sessions of the sample card (ids, times, event counts, waveform sample counts, statistics, usage). Observed on the dev machine: ~3 s via ZIP (30 MB archive).
- **Not yet verified in a real browser.** The Worker, `showDirectoryPicker` and drag-and-drop code paths are exercised through fakes only; a Playwright smoke test arrives with the web app (Phase 2).

## Known gaps
- No streaming of very large ZIPs: the archive is read into memory (fine for a DS2 card, ~30 MB; revisit for ResMed cards with long waveform history).
- `File.webkitRelativePath` is empty for plain multi-file selection; users must pick a folder (or a ZIP). The UI should say so.
- Safari's `webkitdirectory` support and iOS file access need a manual test.

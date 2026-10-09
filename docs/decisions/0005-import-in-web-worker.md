# ADR-0005: Import in a Web Worker, behind a `CardSource` abstraction

- Status: accepted
- Date: 2026-10-09

## Context
Importing the sample card means decrypting and checking ~1 200 files (PBKDF2 key derivation, AES-GCM, CRCs) and decoding ~24 000 waveform chunks: several seconds of CPU. Running that on the UI thread freezes the page. Browsers also differ in how they expose a folder: Chromium has `showDirectoryPicker`, everyone has `webkitdirectory`, and users may prefer a ZIP.

## Decision
1. Parse in a dedicated Web Worker. The UI thread talks to it through a small typed message protocol and consumes sessions as an `AsyncGenerator`.
2. Hide the input behind `CardSource` (`files` | `directory` | `zip`), all structured-cloneable, and behind `VirtualFS` inside the worker. The loaders never see browser APIs.
3. Keep the pipeline (`runImport`) free of `Worker` references so Node tests can run it, and test the protocol with an in-process fake that clones messages.
4. Re-root all paths at a marker folder so users can select the card, its parent, or the marker folder.

## Consequences
- Responsive UI, cancellation by terminating the worker, and transferable typed arrays avoid copies.
- Adding a device requires registering a loader in `worker.ts` and a marker in `ROOT_MARKERS`.
- The worker and `showDirectoryPicker` paths are only covered by fakes until the web app exists (Playwright smoke test planned).
- Entire ZIPs are held in memory; acceptable for DS2 (~30 MB), to be revisited for larger cards.

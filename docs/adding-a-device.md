# Adding a device

This is the checklist for supporting a new CPAP family. The app, the analytics and the tests only ever see the canonical model ([data-model.md](data-model.md)); a loader's whole job is to produce it. The ResMed loader (`packages/loaders/resmed`) is the shortest complete example; the Philips one shows a harder binary format.

## 1. Document the format first
Create `docs/formats/<device>.md` with sources (cite OSCAR class/file names and URLs), the card layout, every file type, every signal with its unit, how files map to sessions, and a list of **unverified** claims. Writing it first exposes gaps before they become code.

## 2. Create the package
`packages/loaders/<name>/` with `package.json` (copy `resmed`'s: name `@opencpap/loader-<name>`, `exports` for `.` and `./testing`), `tsconfig.json`, `src/index.ts`. Then:
- add the package to the root `tsconfig.json` `references`, and to `packages/browser/package.json` dependencies and `tsconfig.json` references; run `npm install` to link the workspace;
- register the loader in `packages/browser/src/worker.ts` (`LOADERS`);
- add the family's root folder to `ROOT_MARKERS` in `packages/browser/src/paths.ts`, and any files that live beside it (such as `STR.edf`) to `ROOT_FILES`. Without this the browser sources drop the files before your loader sees them (this is how a ResMed bug was found).

## 3. Implement `DeviceLoader`
```ts
export const myLoader: DeviceLoader = {
  id: 'my-device',
  async detect(fs) { /* cheap: look at file names only; return null for other families */ },
  async *load(fs, onProgress) { /* yield one Session at a time */ },
};
```
Rules that the conformance checks enforce (see `packages/core/src/conformance.ts`):
- Timestamps are **epoch milliseconds**. A device clock without a zone is encoded as if it were UTC and the session says `clock: 'device-local'`.
- Flow is in **L/min** and pressure in **cmH2O**; leak statistics are in **L/min**. Convert in the loader.
- Choose the leak channel honestly: `leak-total` if the vent flow is included, `leak-unintentional` if it is subtracted.
- Event durations are in seconds; events are sorted by start; they lie inside the session.
- Every session has at least one `mask-on` slice; `id` is unique per device.
- Settings use the shared keys where they exist (`mode` = `cpap` / `auto-cpap` / `bilevel` / `auto-bilevel`, `pressure`, `pressureMin`, `pressureMax`, `epap`, `ipap`, `rampTimeMinutes`, `flexMode`, `flexLevel`, …; see `settingsRows.ts` and `MAJOR_SETTINGS`) so the night view and the change detector understand them. Unknown settings may use extra keys.
- Do not throw for one damaged file; skip it and keep the rest of the card. Throw only when nothing can be read (the worker reports it as an import error).
- Never put the serial number into anything but `DeviceInfo.serial`.

Leave `Session.analysis` empty: the import worker computes it from the flow waveform.

## 4. Tests with synthetic data
- A `testing/builders.ts` that builds a small fake card in memory (never real data; see [privacy-and-security.md](privacy-and-security.md)). Export it as `./testing`.
- Loader tests for detection (positive, negative, case-insensitive paths), a session with events/waveforms/statistics, missing optional files, a damaged file, and progress reporting.
- **Run the shared checks:** `expect(checkSessions(sessions)).toEqual([])`.
- Add the card to `packages/browser/src/fs.test.ts` style tests to prove every card source (folder, file list, ZIP) keeps the files you need.
- If you can, an end-to-end test like `e2e/resmed.e2e.ts`: zip the synthetic card, import it in the browser, open a night.

## 5. Validate against OSCAR on a real card
Export OSCAR's Sessions CSV for the same card and run `npm run compare-oscar` ([oscar-comparison.md](oscar-comparison.md)). Hours, AHI, event counts and leak should match per session within the documented tolerance. Only then change the level in [devices.md](devices.md) from *Synthetic* to *Verified*, naming the model and firmware.

## 6. Update the docs
`README.md` (supported devices), `docs/devices.md`, `docs/roadmap.md`, `docs/features.md`, `CHANGELOG.md`, and an ADR if you made a non-obvious choice.

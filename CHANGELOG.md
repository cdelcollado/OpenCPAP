# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/) once a first release exists.

## [Unreleased]
### Changed
- **UI redesign.** Hierarchy: AHI as the single hero figure with status chip and change versus the 30-night average; tiles with sparklines; compliance meter with a 70 % marker; calendar heatmap; nights table with mini bars. Charts: hover tooltips, click-through to a night, thin marks, validated per-measure colours. Night view: event timeline and flow/leak/pressure/snore tracks aligned on one time axis with a shared cursor readout, event bars and the therapy settings of the night. Header with language selector and theme button; mobile layout for the tracks.
- Status and trend are always shown with an icon and text (never colour alone); event types no longer reuse status colours; large figures use proportional digits.
- Leak/pressure/etc. charts use one hue per measure from the validated series palette ([design-system.md](docs/design-system.md)).
- Bundle split into app / vendor / charts chunks.

### Added (Phase 5)
- **ResMed loader** (`@opencpap/loader-resmed`): AirSense 10 / AirCurve 10 / S9 (AirSense 11 best effort) — identity, `STR.edf` settings, sessions, events, 25 Hz flow and pressure, unintentional leak, CSR episodes. **Tested on synthetic cards only**; see [docs/formats/resmed.md](docs/formats/resmed.md) and [docs/devices.md](docs/devices.md).
- **Generic EDF/EDF+ reader** (`readEdf`) and EDF+ builder (`buildEdfPlus`) in core.
- **Loader conformance suite** (`checkSessions`), applied to both loaders.
- Leak kinds: `leak-unintentional` series and `NightSummary.leakKind`; neutral leak wording in the UI and report in en/ca/es; EPR shown with the other pressure-relief settings.
- Breath analysis reduces faster flow (25 Hz) to 5 Hz before detection.
- Docs: `devices.md`, `adding-a-device.md`, `formats/resmed.md`, ADR-0011.

### Fixed (Phase 5)
- Card sources dropped files that sit beside the marker folder (`STR.edf`, `Identification.tgt`); they are now kept (`ROOT_FILES`) in folder, file-list and ZIP imports.

### Added (Phase 4)
- **Breath analysis** (`breath.ts`, `analysis.ts`): breath rate, variation of breath length and volume, I:E, flat-topped share and a periodic-pattern measure from the 5 Hz flow, scale-free; computed in the import worker with a background backfill for older data. Validated on the real card ([breathing-analysis.md](docs/breathing-analysis.md)).
- **Oximeter import**: CSV parsing, alignment with the CPAP night, ODI3/ODI4, T90/T88, preview with an overlap check, SpO₂/pulse tracks and card ([oximetry.md](docs/oximetry.md)).
- **Alerts** ("Worth a look"), **7-night rolling average**, **distribution histograms**, **breathing trends**.
- **Exports**: nights/events/statistics/oximetry CSV (formula-injection guard) and flow as EDF ([exports.md](docs/exports.md)).
- New plain-language rules, report lines, backup records, IndexedDB **schema v3** (`oximetry`, `oximetrySamples`).
- ADR-0010; 248 unit tests and 55 E2E tests.

### Fixed (Phase 4)
- Night view froze when oximetry tracks were present (new chart data every render + range echo → render loop); data is memoised and `Chart` no longer echoes ranges.
- Backup restore could pair newer oximetry metadata with older samples; samples are accepted only with their metadata.
- Progress counter skipped by `++` inside an optional call, making the backfill report 0.

### Added (Phase 3)
- **Notes**: mood, text and tags per night, saved automatically; note icon in the nights table.
- **Plain-language summary** of each night (deterministic rules, `nightFindings` in core), in three languages.
- **Setting changes**: detection (`settingsChanges`), dashed markers with a flag on the trend charts, a change list on the dashboard.
- **Compare periods** page (`periodStats`, `comparePeriods`, `recentVersusPrevious`, `aroundChange`) with settings diff and event-rate bars; shareable URL.
- **Equipment** page: items, replacement intervals, reminders on the dashboard, *Replace now*, leak-versus-age chart and trend (`equipmentStatus`, `leakByAge`, `dueItems`).
- **Report** page: printable clinician report (A4, light palette, static SVG figures) with optional notes, equipment, previous-period comparison and nights table; PDF content verified with `pdftotext`.
- **Backup / restore**: gzip-compressed NDJSON, validated on read, newest-wins merge for notes and equipment, optional flow data; **persistent-storage** request.
- Dashboard **custom date range**; header links to Compare, Equipment and Report.
- IndexedDB **schema v2** (`journal`, `equipment`) with a v1 → v2 test.
- Docs: `report.md`, `backup-format.md`, Phase 3 sections of `analytics.md`/`storage.md`/`web-app.md`/`design-system.md`/`privacy-and-security.md`, ADR-0009.

### Fixed (Phase 3)
- Header links built from parameterised route builders rendered without `href` (found by the new header-link E2E test).
- Overflow on narrow screens caused by long `<option>` text; the `?` explainer could leave the viewport on phones.
- Demo data: a pressure change and a cushion-age story so the new features have something to show; `NightSummary` now carries the night's settings.

### Added
- `docs/design-system.md`; ADR-0008; E2E tests for tooltips and click-through, calendar, hero, track alignment (pixel measurement), shared readout, therapy settings, date jump and no horizontal overflow on a 390 px phone; unit tests for the heat ramp, dashboard metrics, readout lookups, nice ticks and settings rows.
- Time-weighted leak statistics (`weightedMean`, `weightedPercentile`, `intervalSeconds`) matching OSCAR; `NightSummary.leak.average`.
- OSCAR comparison run on the sample card: 550/550 sessions match on hours, AHI, RDI, event counts and leak ([oscar-comparison.md](docs/oscar-comparison.md)); the comparison tool now reads OSCAR's real CSV format and matches sessions by start time.
- **Web app (Phase 2)**: `apps/web` React/Vite PWA with dashboard, night view (timeline, flow/leak/pressure/snore charts, linked zoom), import screen (folder, ZIP, drag & drop, progress, cancel), settings (language, theme, delete data), demo mode, metric explainers, English/Català/Español, light/dark themes, offline precache.
- IndexedDB storage layer (`Repository`, Dexie) with idempotent re-import.
- `@opencpap/core`: `summarizeNight`, `groupNights`, `nightOf`, `compliance`, `percentile`, `configuredPressure`, `generateDemoSessions`.
- Playwright E2E suite (12 tests incl. real-card import and axe accessibility checks) and `vitest.config.ts`.
- Docs: `web-app.md`, `storage.md`, `analytics.md`, `testing.md`, ADR-0006/0007, screenshots in `docs/img`.
- `CardSource.files` accepts explicit `paths` (dropped folders lose `webkitRelativePath` when cloned to the worker).
- `scripts/compare-oscar.ts`: compares an OSCAR "Sessions" CSV export with OpenCPAP's decoding (usage, AHI, event counts, clock offset); `docs/oscar-comparison.md`.
- `@opencpap/browser`: `FileListFS`, `DirectoryHandleFS` (File System Access API) and `ZipFS` card sources with marker-folder re-rooting and size limits; import worker, message protocol and `importCard` client with progress, error propagation and cancellation.
- `@opencpap/core`: `detectLoader`, `loadCard`, `UnsupportedCardError`.
- `docs/browser-import.md`, ADR-0005.
- DS2 chunk framing reader with header checksum and CRC-32/CRC-16 validation.
- DS2 summary, event and waveform parsers; `philipsDs2Loader.load()` yields canonical sessions (settings, mask slices, events, flow waveform, statistics).
- Canonical model extensions: `Session.id`, `clock`, `slices`, `statistics`, `TimeSeries`, `TherapyEvent.detail`, `variable-breathing`.
- `summarizeSession()` in `@opencpap/core` (usage, event counts, AHI).
- Test suite: synthetic builders for containers/chunks, parser tests, end-to-end loader test, and a real-card integration test that cross-checks parsed counts against the device's own statistics.
- Monorepo scaffold (npm workspaces, TypeScript strict, Vitest).
- Canonical data model, `VirtualFS`, `DeviceLoader` interface in `@opencpap/core`.
- Philips DreamStation 2 loader: detection and encrypted-container decryption (AES-256-GCM, PBKDF2), verified on a real card.
- Documentation set: architecture, data model, DS2 format, roadmap, feature catalog, privacy, development guide.
- GPL-3.0-or-later license.

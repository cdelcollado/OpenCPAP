# Roadmap

Legend: [x] done · [ ] pending

## Phase 0 — Foundations and discovery
- [x] Monorepo (npm workspaces), TypeScript strict, Vitest
- [x] GPL-3.0-or-later license decision ([ADR-0001](decisions/0001-license-gpl3.md))
- [x] Canonical model, `VirtualFS`, `DeviceLoader` interface
- [x] DS2 container decryption, verified on a real card
- [x] DS2 format documented ([formats/ds2.md](formats/ds2.md))
- [ ] Verify competitor feature claims against official sites (currently from search summaries)
- [ ] CI (GitHub Actions: typecheck + tests)
- [ ] Lint/format configuration

## Phase 1 — DS2 loader (data MVP)
- [x] Chunk framing with header checksum and CRC32 validation (24 154 chunks, 0 errors) — `chunk.ts`, `crc.ts`
- [x] Summary parser: slices, settings, device statistics — `summary.ts`
- [x] Event parser and statistics series — `events.ts`
- [x] Flow waveform decoder and segment assembly — `waveform.ts`, `index.ts`
- [x] `DeviceLoader` for DS2 (`detect` + `load`) producing canonical sessions
- [x] Automated cross-check against the device's own statistics (333 sessions, 0 mismatches)
- [x] Synthetic-fixture tests for every parser; real-card integration test (skipped without `fixtures/raw`)
- [x] OSCAR comparison tooling (`scripts/compare-oscar.ts`, [guide](oscar-comparison.md))
- [x] Comparison with OSCAR 2.1.0 on the sample card: 550/550 sessions match on all metrics ([results](oscar-comparison.md#results))
- [ ] Pressure comparison (needs a card from an auto-titrating device; OSCAR leaves pressure empty for fixed CPAP)
- [ ] Interpret `D/*.B03` (device settings log) and `E/*.B04` (device events)
- [x] Browser `VirtualFS` implementations: directory handle, FileList, ZIP — `packages/browser`
- [x] Web Worker import pipeline with progress, errors and cancellation — [browser-import.md](browser-import.md)
- [x] Specific `detect` (rejects older PRS1 cards) and `detectLoader`/`loadCard` in core
- [ ] Real-browser smoke test (Playwright; arrives with the web app in Phase 2)
- [ ] SD anonymizer tool for sharing samples
- [ ] Zero-tag GCM recovery and other firmware variants (410/520/521 models)
- [ ] Night grouping (several device sessions per night) — design in Phase 2

## Phase 2 — Basic visualization (web app)
- [x] Vite + React + TypeScript app with hash routing ([web-app.md](web-app.md), [ADR-0006](decisions/0006-web-stack.md))
- [x] Import screen: folder picker, folder input, ZIP, drag & drop, progress, cancel, errors
- [x] Local persistence in IndexedDB with idempotent re-import ([storage.md](storage.md))
- [x] Dashboard: last night, compliance, averages, trend charts (use, AHI, leak), nights table
- [x] Night view: summary, event timeline, flow/leak/pressure/snore charts with linked zoom, event table
- [x] Night grouping and analytics definitions ([analytics.md](analytics.md), [ADR-0007](decisions/0007-night-definition-and-pressure.md))
- [x] Contextual metric explainers (feature #29) and demo mode (feature #31)
- [x] PWA: installable, offline precache
- [x] i18n: English, Català, Español, with parity tests
- [x] Accessibility: axe checks (WCAG 2.1 A/AA) in light and dark themes
- [x] Dark mode and responsive layout (desktop and 390 px mobile checked)
- [x] End-to-end tests in real Chrome, including the real card ([testing.md](testing.md))
- [x] Visual and interaction redesign (hero hierarchy, hover/click, calendar, aligned night tracks, readout, therapy settings; [design-system.md](design-system.md))
- [ ] Manual accessibility pass with a screen reader; keyboard walkthrough of the charts (keyboard access to chart readouts is not implemented: tables are the keyboard path)
- [ ] Firefox and Safari smoke tests; iOS file access
- [ ] Request persistent storage; surface quota problems
- [ ] Dashboard "pressure/leak distribution" for auto-titrating modes
- [ ] Performance budget for large histories (virtualise the nights table, decimate waveforms on zoom)

## Phase 3 — Analysis, notes, comparison and reports
- [x] Custom date range for the trends, calendar and table
- [x] Setting-change detection, markers on the trend charts and a change list ([analytics.md](analytics.md#setting-changes))
- [x] Period comparison: presets, around a change, shareable URL, settings diff, event-rate bars ([web-app.md](web-app.md))
- [x] Sleep journal: notes, tags, mood; flagged in the nights table; included in backups; optional in the report
- [x] Plain-language summary of the night (rules in three languages)
- [x] Equipment tracking: reminders, replace flow, leak-versus-age trend ([analytics.md](analytics.md#equipment))
- [x] Clinician report: print / save as PDF with options ([report.md](report.md))
- [x] Backup and restore (gzip NDJSON, validated, mergeable) and persistent-storage request ([backup-format.md](backup-format.md))
- [x] IndexedDB schema v2 with a migration test
- [x] Demo story (pressure change, ageing cushion, equipment, notes)
- [x] E2E: notes, summary, changes, comparison, equipment, PDF content via `pdftotext`, backup round trip, axe on every new page in both themes, header links, 390 px layout
- [ ] Keyboard access to the chart readouts; screen-reader pass of the new pages
- [ ] Encrypted backups (optional passphrase)
- [x] Rolling averages and AHI/hours histograms (done in Phase 4)
- [ ] Report: signature block, date of birth and clinic logo as optional fields
- [ ] Clinical review of the plain-language thresholds and the default equipment intervals

## Phase 4 — Advanced analytics
- [x] Scale-free breath-by-breath analysis of the 5 Hz flow: breath rate, variation of breath length/volume, I:E, flat-topped (flow-limitation-like) share, in 5-minute windows ([breathing-analysis.md](breathing-analysis.md))
- [x] Periodic-pattern measure (autocorrelation of the breath envelope), with its limits documented
- [x] Validation on the real card (1.66 M breaths): flat-topped share 11 % at baseline versus 31 % before device-reported flow-limitation events
- [x] Analysis runs in the import worker; background backfill for sessions stored earlier
- [x] Oximeter CSV import, alignment with the CPAP night, ODI3/ODI4, T90/T88, preview with an overlap check ([oximetry.md](oximetry.md))
- [x] Night view: Breathing and Oximeter cards, flat/rate/SpO₂/pulse tracks, shared readout
- [x] Alerts: missed nights, short runs, leak rise, AHI rise ([analytics.md](analytics.md#alerts-worth-a-look))
- [x] 7-night rolling average and AHI / hours distributions
- [x] Exports: nights, events, statistics, oximetry (CSV with formula-injection guard) and flow as EDF ([exports.md](exports.md))
- [x] New plain-language rules (flat breaths, periodic pattern, oxygen), report lines, backup records, IndexedDB schema v3
- [x] E2E: 15 tests (analysis, oximetry import/remove, exports, alerts, zoom regression, axe, phone layout)
- [ ] Validate the periodic-pattern measure against nights with clinically confirmed periodic breathing (the current one misses brief episodes)
- [ ] Validate oximeter parsing against real files from several brands (only a synthetic layout is tested)
- [ ] Snore analysis beyond the device's own snore count; Glasgow-index-style multi-feature scoring
- [ ] Wearable integrations (Apple Watch, Oura, Garmin, Fitbit)
- [ ] Rolling averages for leak/pressure, event-type distribution histograms
- [ ] JSON export of the canonical model

## Phase 5 — Multi-device
- [x] Generic EDF / EDF+ reader in core (`readEdf`) and an EDF+ builder (`buildEdfPlus`) for synthetic cards
- [x] ResMed AirSense 10 / AirCurve 10 / S9 loader: identity, `STR.edf` settings, sessions, events, 25 Hz flow and pressure, unintentional leak, CSR episodes ([formats/resmed.md](formats/resmed.md))
- [x] Shared loader conformance suite (`checkSessions`), applied to the Philips and ResMed loaders
- [x] Card sources keep root files such as `STR.edf` and `Identification.tgt` (found by the browser-level tests)
- [x] Leak kinds (`leak-total` vs `leak-unintentional`, `NightSummary.leakKind`) and neutral wording in the UI
- [x] Compatibility matrix ([devices.md](devices.md)) and contributor guide ([adding-a-device.md](adding-a-device.md))
- [x] Tests: loader (19), EDF reader (8), conformance (4), card sources with root files, worker with analysis, E2E on a synthetic ResMed ZIP
- [ ] **Validate the ResMed loader on real AirSense 10 / AirCurve 10 / AirSense 11 cards against OSCAR** (needs a volunteer's card); only then mark it *Verified*
- [ ] Derive sessions and mask-off periods from `STR.edf` mask times like OSCAR
- [ ] Import `RespRate`, `TidVol`, `MinVent`, `Snore`, `FlowLim` and the device oximeter (SAD)
- [ ] Bi-level and ASV modes (names, settings)
- [ ] Per-device filter / device-change marker on the timeline
- [ ] Philips DreamStation 1 / System One (unencrypted `.00n`), Fisher & Paykel, BMC, Löwenstein

## Phase 6 — Connectivity and sharing (optional)
E2E-encrypted share links, Wi-Fi SD companion, MQTT/Home Assistant, opt-in LLM summaries.

## Risks
- DS2 format is proprietary; OSCAR is the living reference.
- File System Access API is Chromium-only; fallback required.
- Waveform volume; health-data privacy/GDPR if any backend appears.

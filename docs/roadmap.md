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
- [ ] Run the comparison on the sample card — needs the maintainer's OSCAR "Sessions" CSV export
- [ ] Pressure/leak comparison (OSCAR's unintentional-leak model)
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
- [ ] Manual accessibility pass with a screen reader; keyboard walkthrough of the charts
- [ ] Firefox and Safari smoke tests; iOS file access
- [ ] Request persistent storage; surface quota problems
- [ ] Dashboard "pressure/leak distribution" for auto-titrating modes
- [ ] Performance budget for large histories (virtualise the nights table, decimate waveforms on zoom)

## Phase 3 — Analysis and trends
Trends, compliance, period comparison, notes/tags, PDF report, backup/restore, mask/consumables tracking.

## Phase 4 — Advanced analytics
Flow limitation, breathing regularity, snore, periodic breathing, oximetry import, anomaly alerts, exports.

## Phase 5 — Multi-device
ResMed (EDF+) first, then others; conformance suite; compatibility matrix.

## Phase 6 — Connectivity and sharing (optional)
E2E-encrypted share links, Wi-Fi SD companion, MQTT/Home Assistant, opt-in LLM summaries.

## Risks
- DS2 format is proprietary; OSCAR is the living reference.
- File System Access API is Chromium-only; fallback required.
- Waveform volume; health-data privacy/GDPR if any backend appears.

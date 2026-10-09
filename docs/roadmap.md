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
- [ ] PRS1 chunk parser (header, types, CRC)
- [ ] Map `.B01`/`.B02`/`.B05` to sessions, events, waveforms
- [ ] Map `D/*.B03` (settings) and `E/*.B04` (device events)
- [ ] Browser `VirtualFS` implementations (directory handle, FileList, ZIP)
- [ ] Cross-validation vs OSCAR (AHI, hours, P95 pressure/leak)
- [ ] SD anonymizer tool for sharing samples

## Phase 2 — Basic visualization
Dashboard, daily view with waveforms, local persistence, PWA, i18n (ca/es/en), accessibility.

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

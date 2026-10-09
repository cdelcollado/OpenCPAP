# Feature catalog and idea origins

Reference products: OSCAR, SleepHQ, CPAP Clarity, AirwayLab (and Aerivue), SomniCharts, CpapDash; also MySleepDash and ResMed myAir. Claims about those products come from public listings and search summaries and are **unverified** until checked against official sources (roadmap, Phase 0).

| # | Feature | Origin | Phase |
|---|---|---|---|
| 1 | Import SD card folder/ZIP in the browser | OSCAR, CPAP Clarity, AirwayLab | 1 |
| 2 | 100% local processing, no account or upload | CPAP Clarity, AirwayLab, Aerivue | 0 |
| 3 | DreamStation 2 support | OSCAR | 1 |
| 4 | Multi-device plugin architecture + canonical model | Original (inspired by Clarity's multi-vendor support) | 0 |
| 5 | Automated cross-validation against OSCAR | CPAP Clarity | 1 |
| 6 | Dashboard: AHI, usage, P95 pressure and leak | SleepHQ, OSCAR, CpapDash | 2 |
| 7 | Zoomable waveforms with event overlay | OSCAR, SleepHQ, CpapDash | 2 |
| 8 | Event breakdown (OA/CA/H/RERA) | OSCAR, SleepHQ | 2 |
| 9 | 7/30/90-day trends | CpapDash, SleepHQ, OSCAR | 3 |
| 10 | Compliance (≥4 h, 70% of nights) | CpapDash, myAir | 3 |
| 11 | Sleep journal, tags, emojis | SleepHQ | 3 |
| 12 | Clinician PDF report | OSCAR, CPAP Clarity, MySleepDash | 3 |
| 13 | Plain-language nightly summary | CPAP Clarity, SomniCharts | 3 |
| 14 | Flow limitation / Glasgow-style index | AirwayLab | 4 |
| 15 | Breathing regularity, snore, periodic breathing | AirwayLab, OSCAR | 4 |
| 16 | Oximetry import (SpO2/pulse) aligned with therapy | OSCAR, SleepHQ, Clarity, SomniCharts | 4 |
| 17 | Wearable integration (Apple Watch, Oura, Garmin, Fitbit) | CPAP Clarity | 4+ |
| 18 | CSV/JSON/EDF export | OSCAR | 4 |
| 19 | Revocable share links without personal data | SleepHQ | 6 |
| 20 | End-to-end encrypted sharing (key in URL fragment) | Original | 6 |
| 21 | Automatic sync via Wi-Fi SD adapter | CpapDash, SleepHQ (Magic Uploader) | 6 |
| 22 | Self-hosted mode (PostgreSQL/MySQL), MQTT/Home Assistant | CpapDash Desktop | 6 |
| 23 | AI/LLM summaries (local by default) | SomniCharts (SomniDoc), CpapDash Desktop | 6 |
| 24 | Installable PWA, offline use | Original | 2 |
| 25 | Settings-change annotations on charts | Original | 3 |
| 26 | Period comparator (before/after mask or pressure change) | Original (extends OSCAR/SleepHQ) | 3 |
| 27 | Mask/consumables tracking with leak correlation | Original (inspired by myAir) | 3 |
| 28 | Anomaly alerts (sustained leak, AHI spikes, missed nights) | Original | 4 |
| 29 | Contextual metric explainers | Original | 2 |
| 30 | Clinic mode: multi-patient, batch import | SleepHQ, MySleepDash | 6+ |
| 31 | Demo mode with synthetic data | Original | 2 |
| 32 | SD anonymizer for sharing samples with the community | Original | 1 |
| 33 | Local database backup/restore | Original | 3 |
| 34 | External context correlation (position, noise, temperature) | Original | 6 |
| 35 | Loader catalog with per-model support matrix | Original (OSCAR keeps a device list) | 5 |
| 36 | Accessibility (WCAG AA), dark mode, screen readers | Original | 2 |

## Implemented so far
| # | Feature | Where |
|---|---|---|
| 1 | Import SD card folder/ZIP in the browser | [browser-import.md](browser-import.md) |
| 2 | 100 % local processing | [privacy-and-security.md](privacy-and-security.md) |
| 3 | DreamStation 2 support | [formats/ds2.md](formats/ds2.md) |
| 4 | Multi-device plugin architecture + canonical model | [architecture.md](architecture.md), [data-model.md](data-model.md) |
| 5 | Automated cross-validation (against the device's own statistics; OSCAR tooling ready) | [oscar-comparison.md](oscar-comparison.md) |
| 6 | Dashboard (use, AHI, leak, pressure) | [web-app.md](web-app.md) |
| 7 | Zoomable waveforms with event overlay (timeline + linked charts) | [web-app.md](web-app.md) |
| 8 | Event breakdown (OA/CA/H/RERA…) | [web-app.md](web-app.md) |
| 9 | Trends (7/30/90 nights, all) | [web-app.md](web-app.md) |
| 10 | Compliance (≥ 4 h on ≥ 70 % of 30 nights) | [analytics.md](analytics.md) |
| 24 | Installable PWA, offline use | [web-app.md](web-app.md) |
| 29 | Contextual metric explainers | [web-app.md](web-app.md) |
| 31 | Demo mode with synthetic data | [web-app.md](web-app.md) |
| 36 | Accessibility (axe-verified WCAG 2.1 AA), dark mode — screen-reader pass pending | [web-app.md](web-app.md) |

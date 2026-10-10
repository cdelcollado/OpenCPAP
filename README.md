# OpenCPAP

[![Ask DeepWiki](docs/img/ask-deepwiki.svg)](https://deepwiki.com/cdelcollado/OpenCPAP)

A local-first web application for reading and visualizing the therapy data that a CPAP machine records on its SD card. The first supported device is the **Philips Respironics DreamStation 2**; the architecture is built so that other manufacturers (ResMed, Fisher & Paykel, BMC, Löwenstein, …) can be added as plugins.

> **Medical disclaimer.** OpenCPAP is an informational tool. It is not a medical device and does not provide medical advice, diagnosis or therapy recommendations. Discuss your data and any setting changes with your clinician.
>
<a href="https://deepwiki.com/cdelcollado/OpenCPAP"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>

## Principles

- **Privacy first.** All parsing and analysis runs in your browser. Your data is never uploaded unless you explicitly opt in to a future sharing feature.
- **Device-agnostic core.** Every device loader outputs the same canonical data model, so the UI and analytics never depend on a manufacturer's format.
- **Verified against OSCAR.** Results are compared with [OSCAR](https://www.sleepfiles.com/OSCAR/) on the same SD card: on the sample card every session matches on hours, AHI, event counts and leak ([details](docs/oscar-comparison.md)).
- **Open.** GPL-3.0-or-later.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations, model, DS2 container decryption | Done (CI/lint pending) |
| 1 | DS2 chunk parser and data loader | Parser validated against OSCAR 2.1.0 (550/550 sessions, all metrics); browser import done; device-log files (`D`/`E`) and anonymizer pending (see [roadmap](docs/roadmap.md)) |
| 2 | Web app: import, dashboard, night view, local storage, PWA, i18n, accessibility | Done (see [web-app.md](docs/web-app.md)); manual screen-reader and Firefox/Safari checks pending |
| 3 | Notes, summary in plain language, setting changes, period comparison, equipment tracking, clinician report (print/PDF), backup and restore | Done (see [roadmap](docs/roadmap.md)) |
| 4 | Breath analysis (flat-topped breaths, rate, regularity, periodic pattern), oximeter import (ODI, T90), alerts, rolling averages and distributions, CSV/EDF exports | Done; **experimental** measures, see [breathing-analysis.md](docs/breathing-analysis.md) and [oximetry.md](docs/oximetry.md) |
| 5 | Multi-device: generic EDF reader, ResMed AirSense/AirCurve loader, shared loader conformance suite, compatibility matrix, guide for adding devices | Done; ResMed is tested on **synthetic** cards only, see [devices.md](docs/devices.md) |
| 6 | Serverless share links (optionally passphrase-encrypted), opt-in local language-model summary, JSON summary for other tools | Done for what a static app can do; companion/MQTT/Home Assistant and server-based sharing **not built** ([integrations.md](docs/integrations.md)) |
| 6+ | Orientative reference ranges next to the metrics (three states, per device family), in the app and the PDF report | Done; **sources not cited yet**, values marked unverified ([reference-ranges.md](docs/reference-ranges.md)) |

## Supported devices

| Device | Detect | Decrypt | Parse | Notes |
|---|---|---|---|---|
| Philips DreamStation 2 | yes | yes | yes — sessions, settings, events, flow waveform, statistics | **Verified** on a 420X150C, firmware V1.0.6 (matches OSCAR); other DS2 variants untested |
| ResMed AirSense 10 / AirCurve 10 / S9 | yes | n/a (plain EDF+) | yes — sessions, settings, events, flow (25 Hz), pressure, leak | **Synthetic only**: built from OSCAR's behaviour and the EDF spec, never run on a real card ([formats/resmed.md](docs/formats/resmed.md)) |
| ResMed AirSense 11 | best effort | n/a | best effort | Unverified |

Full matrix, support levels and how to help: [docs/devices.md](docs/devices.md).

## Repository layout

```
packages/core/                 canonical model, VirtualFS, DeviceLoader interface
packages/loaders/philips-ds2/  DreamStation 2 loader (decryption, chunk parsing, sessions)
packages/loaders/resmed/       ResMed loader (EDF+ files, STR.edf settings)
packages/browser/              card sources (folder, files, ZIP), Web Worker import pipeline
apps/web/                      the web app (React + Vite PWA)
e2e/                           Playwright end-to-end and accessibility tests
scripts/                       developer tools (OSCAR comparison)
docs/                          documentation (start with docs/architecture.md)
fixtures/raw/                  real SD data, git-ignored, never committed
```

## Screenshots
![Dashboard](docs/img/dashboard.png)
![Night view](docs/img/night.png)
![Calendar](docs/img/calendar.png)
![Compare periods](docs/img/compare.png)

*(Synthetic demo data.)* Try it without a card: **Import → Load demo data**.

## Quick start

```bash
npm install
npm run dev        # web app on http://localhost:5173
npx tsc -b         # type-check
npx vitest run     # unit and integration tests
npm run e2e        # build + end-to-end and accessibility tests in Chrome
```

Requires Node.js 20+ (developed on Node 24) and, for the E2E tests, Google Chrome. See [docs/development.md](docs/development.md) and [docs/testing.md](docs/testing.md).

## Using it
1. Open the app, go to **Import** and choose the SD card's root folder (it contains `P-SERIES` for a Philips DreamStation 2, or `DATALOG` and `STR.edf` for a ResMed), drop it, or pick a ZIP of it.
2. Browse the **Dashboard** and open any **night** for the timeline and waveforms.
3. Add a **note** (mood, text, tags) to a night, track your **equipment**, **compare** two periods (for example before and after a setting change) and print a **report** for your clinician.
4. Everything stays in your browser. **Settings** lets you change language/theme, **back up and restore** your data, and delete all stored data.

## Documentation index

- [Architecture](docs/architecture.md)
- [Web application (screens, charts, i18n, a11y, PWA)](docs/web-app.md)
- [Design system (tokens, palette, chart rules, accessibility checklist)](docs/design-system.md)
- [Clinician report (print / PDF)](docs/report.md)
- [Backup file format](docs/backup-format.md)
- [Sharing a snapshot (links, encryption, threat model)](docs/sharing.md)
- [Written summaries with a local language model](docs/llm-summaries.md)
- [Integrations (Home Assistant, MQTT, Wi-Fi SD)](docs/integrations.md)
- [Supported devices and support levels](docs/devices.md)
- [Adding a device](docs/adding-a-device.md)
- [ResMed format](docs/formats/resmed.md)
- [Browser import (card sources, worker protocol)](docs/browser-import.md)
- [Local storage (IndexedDB schema)](docs/storage.md)
- [Analytics definitions (nights, AHI, leak, pressure, compliance)](docs/analytics.md)
- [Testing strategy](docs/testing.md)
- [Comparing with OSCAR](docs/oscar-comparison.md)
- [Canonical data model](docs/data-model.md)
- [DreamStation 2 file format](docs/formats/ds2.md)
- [Roadmap](docs/roadmap.md)
- [Feature catalog and idea origins](docs/features.md)
- [Privacy and security](docs/privacy-and-security.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)
- [Architecture decision records](docs/decisions/)

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). Parts of the DreamStation 2 decoding logic are adapted from OSCAR's PRS1 loader (also GPLv3).

# OpenCPAP

A local-first web application for reading and visualizing the therapy data that a CPAP machine records on its SD card. The first supported device is the **Philips Respironics DreamStation 2**; the architecture is built so that other manufacturers (ResMed, Fisher & Paykel, BMC, Löwenstein, …) can be added as plugins.

> **Medical disclaimer.** OpenCPAP is an informational tool. It is not a medical device and does not provide medical advice, diagnosis or therapy recommendations. Discuss your data and any setting changes with your clinician.

## Principles

- **Privacy first.** All parsing and analysis runs in your browser. Your data is never uploaded unless you explicitly opt in to a future sharing feature.
- **Device-agnostic core.** Every device loader outputs the same canonical data model, so the UI and analytics never depend on a manufacturer's format.
- **Verified against OSCAR.** Parsers are validated against [OSCAR](https://www.sleepfiles.com/OSCAR/) results on the same SD card.
- **Open.** GPL-3.0-or-later.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations, model, DS2 container decryption | Mostly done (see [roadmap](docs/roadmap.md)) |
| 1 | DS2 chunk parser and data loader | Not started |
| 2–6 | UI, analytics, multi-device, sharing | Planned |

## Supported devices

| Device | Detect | Decrypt | Parse | Notes |
|---|---|---|---|---|
| Philips DreamStation 2 | yes | yes | no (Phase 1) | Verified on a 420X150C, firmware V1.0.6 |

## Repository layout

```
packages/core/                 canonical model, VirtualFS, DeviceLoader interface
packages/loaders/philips-ds2/  DreamStation 2 loader (container decryption, detection)
apps/web/                      web UI (not yet created)
docs/                          documentation (start with docs/architecture.md)
fixtures/raw/                  real SD data, git-ignored, never committed
```

## Quick start

```bash
npm install
npx tsc -b        # type-check
npx vitest run    # tests
```

Requires Node.js 20+ (developed on Node 24). See [docs/development.md](docs/development.md).

## Documentation index

- [Architecture](docs/architecture.md)
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

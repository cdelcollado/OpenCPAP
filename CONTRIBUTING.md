# Contributing

Thanks for helping! Please read [docs/development.md](docs/development.md) first.

## Ground rules
- All code comments, documentation and commit messages are in **English**.
- **Never share real patient data or serial numbers** in issues or PRs. Use the anonymizer (planned) or synthetic data.
- Every change that alters behavior must update the relevant docs (`docs/`, `README.md`, `CHANGELOG.md`).
- Parsers must be bounds-safe and covered by tests; cross-check numeric results against OSCAR when possible.
- By contributing you agree to license your work under GPL-3.0-or-later.

## Workflow
1. Open an issue describing the change (device support requests should include model number and firmware).
2. Branch from `main`, keep commits focused.
3. Run `npx tsc -b && npx vitest run` before pushing.
4. Open a PR describing what changed, why, and how it was verified.

## Adding device support
See [docs/adding-a-device.md](docs/adding-a-device.md) and [docs/devices.md](docs/devices.md) (support levels). Format documentation is as important as code. The most valuable contribution right now is running the app on a **real card of another device** and comparing it with OSCAR — never attach the card itself: it contains health data and the serial number.

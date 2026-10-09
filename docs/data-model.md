# Canonical data model

Source of truth: `packages/core/src/model.ts`. This document explains each type and the conventions loaders must follow. Update both together.

## Conventions
- **Timestamps:** UTC epoch **milliseconds** (`number`).
- **Durations:** **seconds** (`number`), `0` for instantaneous events.
- **Sample rates:** Hz. Waveform samples are `Float32Array` in the unit given by `unit`.
- **Missing data:** optional fields are omitted rather than set to `0` or `NaN`.

## `DeviceInfo`
| Field | Type | Description |
|---|---|---|
| `manufacturer` | string | e.g. `Philips Respironics` |
| `model` | string | Human-readable model name |
| `serial` | string | Device serial number (treat as sensitive; never log or commit) |
| `firmware` | string? | Firmware version if reported |

## `Session`
One continuous therapy session (mask on → mask off).
| Field | Type | Description |
|---|---|---|
| `device` | `DeviceInfo` | Source device |
| `start`, `end` | number | Session bounds (UTC ms) |
| `settings` | `SessionSettings` | Mode and therapy settings in effect (free-form keys; common keys to be standardized in Phase 1) |
| `events` | `TherapyEvent[]` | Detected events |
| `waveforms` | `Waveform[]` | Continuous signals |
| `deviceSummary` | record? | Statistics already summarized by the device, used for cross-checking our own computation |

## `TherapyEvent`
`type` is one of: `obstructive`, `central`, `hypopnea`, `unclassified-apnea`, `rera`, `flow-limitation`, `snore`, `periodic-breathing`, `large-leak`, `vibratory-snore`. `start` (UTC ms), `duration` (s).

## `Waveform`
`channel`: `flow`, `pressure`, `leak`, `tidal-volume`, `resp-rate`, `spo2`, `pulse`. Plus `unit`, `sampleRate` (Hz), `start` (UTC ms), `samples`.

## Open questions (resolve in Phase 1)
- Standard keys and units for `settings` across devices.
- How to represent non-uniformly sampled summary signals (e.g. per-minute stats).
- Whether to add a per-session `masks`/`humidifier` structure.

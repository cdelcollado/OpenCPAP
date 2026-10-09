# Canonical data model

Source of truth: `packages/core/src/model.ts` (and `stats.ts` for derived values). This document explains each type and the conventions loaders must follow. Update both together.

## Conventions
- **Timestamps:** milliseconds since epoch (`number`). The meaning depends on `Session.clock` (see below).
- **Durations:** **seconds** (`number`), `0` for instantaneous events.
- **Sample rates:** Hz. Waveform samples are `Float32Array` in the unit given by `unit`.
- **Pressures:** cmH₂O. **Leak and flow:** L/min.
- **Missing data:** optional fields are omitted rather than set to `0` or `NaN`.

## `DeviceInfo`
| Field | Type | Description |
|---|---|---|
| `manufacturer` | string | e.g. `Philips Respironics` |
| `model` | string | Human-readable model name |
| `serial` | string | Device serial number (**sensitive**; never log or commit) |
| `firmware` | string? | Firmware version if reported |

## `Session`
One device-defined session. A session may contain several mask-on periods (`slices`) when the user takes the mask off and puts it on again.

| Field | Type | Description |
|---|---|---|
| `id` | number | Session id assigned by the device (unique per device) |
| `device` | `DeviceInfo` | Source device |
| `start`, `end` | number | First mask-on and end of the session (ms) |
| `clock` | `'utc'` \| `'device-local'` | `device-local` means the device stores wall-clock time without zone information; the values are wall-clock seconds encoded as if UTC (DS2, as in OSCAR). Use `Date#getUTC*` to read back the wall-clock time |
| `slices` | `Slice[]` | `mask-on` / `mask-off` periods. **Therapy usage = total of `mask-on` slices** |
| `settings` | `SessionSettings` | Therapy settings in effect (see below) |
| `events` | `TherapyEvent[]` | Detected events, ascending by `start` |
| `waveforms` | `Waveform[]` | Continuous signals; a channel may appear several times if the recording has gaps |
| `statistics` | `TimeSeries[]` | Irregularly sampled device statistics (see below) |
| `deviceSummary` | record? | Counts that the device itself reported, used to cross-check the parser |
| `unknownRecords` | number? | Records the parser skipped because their meaning is unknown (diagnostic; 0 on the sample card) |

## `Slice`
`start`, `end` (ms) and `status`: `mask-on`, `mask-off` or `equipment-off`.

## `TherapyEvent`
`type`: `obstructive`, `central`, `hypopnea`, `unclassified-apnea`, `rera`, `flow-limitation`, `snore`, `periodic-breathing`, `large-leak`, `vibratory-snore`, `variable-breathing`.
`start` (ms), `duration` (s), optional `detail`. Apneas/hypopneas/RERA are instantaneous flags (`duration 0`); periodic breathing, large leak and variable breathing carry a duration. DS2 sets `detail: 'alt-hypopnea'` on hypopneas stored under record `0x0B`, which OSCAR counts but the device's own statistics do not.

## `Waveform`
`channel` (`flow`, `pressure`, `leak`, `tidal-volume`, `resp-rate`, `spo2`, `pulse`), `unit`, `sampleRate` (Hz), `start` (ms), `samples`. DS2 provides only `flow` (5 Hz, L/min per OSCAR, scaling unverified).

## `TimeSeries`
Irregular statistics: `channel` (`pressure-set`, `epap-set`, `ipap-set`, `pressure-avg`, `flex-pressure-avg`, `leak-total`, `snore-count`), `unit`, `times` (ms, ascending) and `values`. DS2 emits `leak-total` and `snore-count` about every 2 minutes, `pressure-set` whenever the target pressure changes, and `flex-pressure-avg` (or `pressure-avg` in bi-level) per interval.

## `SessionSettings`
Free-form keys with these conventions (set when the device reports them):
`mode` (`cpap`, `cpap-check`, `auto-cpap`, `bilevel`, `auto-bilevel`), `pressure`, `pressureMin`, `pressureMax`, `epap`, `ipap`, `pressureSupport`, `epapMin`, `ipapMax`, `pressureSupportMin`, `pressureSupportMax`, `autoTrialDays`, `ezStart`, `rampType` (`linear`, `smart-ramp`, `ramp-plus`), `rampTimeMinutes`, `rampPressure`, `flexMode`, `flexLevel`, `humidifierPresent`, `humidifierMode` (`fixed`, `adaptive`, `heated-tube`, `passover`, `error`), `humidifierLevel`, `heatedTubeTemperature`, `maskResistance`, `tubingDiameterMm`, `showAhiOnDevice`, `autoOn`, `autoOff`, `patientControlsAccess`.

## Derived values (`summarizeSession`)
- `usageHours` = total `mask-on` time.
- `counts` per `EventType`.
- `ahi` = (obstructive + central + hypopnea + unclassified-apnea) / `usageHours`. RERAs are not included. Hypopneas with `detail: 'alt-hypopnea'` are included, matching OSCAR (a stricter, device-matching AHI can filter them out).

## Open questions
- Whether to standardize `settings` further (typed union per mode) once a second manufacturer is added.
- How to represent mask-off periods that belong to the same night but different device sessions (night grouping belongs to the analytics layer, Phase 2/3).
- Whether to store the original clock offset when a device records one.

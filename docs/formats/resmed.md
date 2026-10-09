# ResMed AirSense 10 / AirCurve 10 / S9 — SD card format

**Status: implemented from documentation and OSCAR's behaviour, tested only on synthetic cards. Nothing here has been checked against a real ResMed card** (the maintainer's device is a Philips DreamStation 2). Every statement that has not been confirmed on real data is marked *unverified*. The first person to run the app on a real ResMed card should compare the results with OSCAR and report differences (see [oscar-comparison.md](../oscar-comparison.md) and [adding-a-device.md](../adding-a-device.md)).

**Sources:** OSCAR's `oscar/SleepLib/loader_plugins/resmed_loader.cpp` (GPLv3) and `resmed_loader.h`; the public EDF and EDF+ specifications (<https://www.edfplus.info/specs/edf.html>, <https://www.edfplus.info/specs/edfplus.html>).

Implementation: `packages/loaders/resmed/src/` (`index.ts` loader, `identification.ts`, `str.ts`) and the generic EDF reader `packages/core/src/edfRead.ts`. Tests: `resmed.test.ts`, `edfRead.test.ts`, and the card-source tests in `packages/browser/src/fs.test.ts`.

## 1. Card layout

```
Identification.tgt       text: device serial, product name, product code, firmware   (AirSense 10, AirCurve 10, S9)
Identification.json      same information as JSON                                      (AirSense 11; layout unverified)
STR.edf                  daily summary: one EDF record per day, settings + device statistics
SETTINGS/, ...           other folders; ignored
DATALOG/
  YYYYMMDD/              the day the session STARTED (calendar day, not the noon-to-noon "night")
    YYYYMMDD_HHMMSS_BRP.edf    breathing flow and pressure, 25 Hz
    YYYYMMDD_HHMMSS_PLD.edf    pressure, leak and other per-2-seconds statistics
    YYYYMMDD_HHMMSS_EVE.edf    events (EDF+ annotations)
    YYYYMMDD_HHMMSS_CSL.edf    Cheyne-Stokes episodes (EDF+ annotations)
    YYYYMMDD_HHMMSS_SAD.edf    pulse oximeter attached to the device (SpO2, pulse), 1 Hz
```

`STR.edf` and `Identification.*` sit **next to** `DATALOG`, not inside it. The browser sources keep these root files only when they share their folder with a marker folder (`ROOT_FILES` in `packages/browser/src/paths.ts`); if a user selects the `DATALOG` folder itself, settings and serial number are therefore not available, and the app imports the therapy data without them. File names are matched case-insensitively.

Older S9 cards use the same layout; a few very old firmware versions name the files differently (*unverified*, not handled).

## 2. EDF / EDF+

All data files are EDF+C (continuous). Integers in the header are ASCII text; samples are 16-bit little-endian signed. The reader (`readEdf`) returns the header fields, each signal converted to physical units, the annotations and the record start offsets. Behaviours that matter for real cards:

- **Clock:** the start date and time are the device's wall-clock time without a zone. The app reads them as UTC, exactly like the Philips loader, and marks the session `clock: 'device-local'`.
- **Unfinished files:** a file whose header declares more records than it contains (or `-1`) is read with the records that exist; a truncated last record is dropped. A file with a corrupt header is skipped by the loader and its siblings are still imported.
- **Annotations:** the "EDF Annotations" signal holds time-stamped lists (`+onset 0x15 duration 0x14 text 0x14 0x00`). The first entry of every record is the record's timekeeping entry and carries no text.
- **Not handled:** EDF+D (discontinuous) files are read as if continuous; the record onsets are exposed (`recordOnsets`) for a future need. *Unverified* whether any ResMed file uses it.

## 3. Signals and how they map to the canonical model

Label matching is by prefix (`Flow` matches `Flow.40ms`), because ResMed encodes the sample interval in the label and it has changed between firmware versions (*unverified*).

| File | Signal | Unit in file | Canonical model |
|---|---|---|---|
| BRP | `Flow.40ms` | L/s | `Waveform` `flow`, **× 60 → L/min**, 25 Hz |
| BRP | `Press.40ms` | cmH2O | `Waveform` `pressure`, 25 Hz |
| PLD | `Leak.2s` | L/s | `TimeSeries` `leak-unintentional`, **× 60 → L/min**, one value per 2 s, time = end of the interval |
| PLD | `Press.2s` | cmH2O | `TimeSeries` `pressure-set`, only the points where it changes by ≥ 0.05 cmH2O |
| PLD | `MaskPress.2s`, `EprPress.2s`, `RespRate.2s`, `TidVol.2s`, `MinVent.2s`, `Snore.2s`, `FlowLim.2s` | various | **not imported yet** (see the roadmap) |
| EVE | annotations | — | `TherapyEvent`, see below |
| CSL | `CSR Start` | — | `TherapyEvent` `periodic-breathing`, duration from the annotation |
| SAD | `Pulse.1s`, `SpO2.1s` | — | **not imported yet** |

Negative or non-numeric leak and pressure samples are the device's "no data" markers and are skipped.

### Events (EVE annotations)

| Annotation text | Event type |
|---|---|
| `Obstructive Apnea` | `obstructive` |
| `Central Apnea` | `central` |
| `Apnea` | `unclassified-apnea` (ResMed's "unclassified/unknown" apnea) |
| `Hypopnea` | `hypopnea` |
| `Arousal` | `rera` (OSCAR does the same) |
| `Recording starts` and empty text | ignored |
| anything else | counted in `Session.unknownRecords` |

Onsets are seconds from the start of the file; durations are the annotation durations (0 when absent). ResMed hypopneas are scored by the device with its own algorithm, so AHI values are comparable with OSCAR's for ResMed data but not with a Philips device's.

## 4. Sessions

A session is the set of files that share the same start second, anchored on the BRP (flow) file:

1. Files are grouped by their start time (read from the EDF header, not from the file name).
2. A group without a BRP file (for example events and pressure only) is attached to the BRP group that covers its start, with ±60 s of tolerance, because real cards are not perfectly aligned (*unverified*, based on OSCAR's behaviour of matching files by time).
3. A group that matches nothing becomes a session of its own, without waveforms.
4. `Session.id` is the start time in epoch seconds (unique per device).
5. The data files only exist while the mask is on, so the whole span is one `mask-on` slice. Mask-off periods are the gaps between sessions.

**Known limitation:** if the device splits one mask-on period into several BRP files, they appear as separate sessions of the same night. Usage and event counts per night are still correct (nights add their sessions), but a per-session view would show the split. OSCAR derives sessions from the mask-on/off times in `STR.edf` instead; doing the same is on the roadmap once a real card is available to validate it.

## 5. `STR.edf` — settings and the device's own daily summary

One EDF record per day, **noon to noon** (the record starts at 12:00 and lasts 86 400 s). Signals have one value per record, except `Mask On` / `Mask Off`, which have 10 values (minutes since the start of the record, `-1` for unused slots).

| Label | Use |
|---|---|
| `Mode` | `0` → `cpap`, `1` → `auto-cpap`; any other code is kept as `Mode N` (bi-level, ASV and AirSense 11 modes are *unverified* and not named) |
| `S.C.Press` | `pressure` (CPAP mode only) |
| `S.A.MinPress`, `S.A.MaxPress` | `pressureMin`, `pressureMax` (auto mode only) |
| `S.A.StartPress` | `rampPressure` |
| `S.RampTime` | `rampTimeMinutes` |
| `S.EPR.EPREnable`, `S.EPR.Level` | `flexMode` = `epr` or `none`, `flexLevel` (expiratory pressure relief is stored under the same keys as Philips' Flex so the app shows and compares both) |
| `Duration` (minutes), `AHI`, `OAI`, `CAI`, `HI`, `UAI`, `Leak.50`, `Leak.95` (L/s) | the device's own daily figures, exposed by `parseStr` for cross-checks; not used for the app's numbers |

A session takes the settings of the STR day record that contains its start. If `STR.edf` is missing or damaged the therapy data is imported without settings.

## 6. Device identity

`Identification.tgt` has one `#KEY value` per line (names from OSCAR):

| Key | Meaning |
|---|---|
| `#SRN` | serial number (**private**, never exported or shown in reports) |
| `#PNA` | product name with underscores, e.g. `AirSense_10_AutoSet` |
| `#PCD` | numeric product code |
| `#PVR` | software/firmware version (*unverified* which key holds the firmware) |

`Identification.json` (AirSense 11) is searched for `SerialNumber`, `ProductName`, `ProductCode`, `SoftwareVersion` at any depth because its exact layout has not been verified.

## 7. Leak is not the same quantity as on Philips devices

ResMed reports **unintentional leak** (the vent flow of the mask is already subtracted); Philips reports **total leak**, which includes it. The model keeps them as different channels (`leak-unintentional`, `leak-total`), `NightSummary.leakKind` records which one a night holds, and the app words its explanations accordingly. Never compare their absolute values; trends within one device are meaningful.

## 8. Open questions

1. Verify every label, unit and the session grouping on real AirSense 10 and AirCurve 10 cards; compare nights, AHI and leak with OSCAR with `scripts/compare-oscar.ts`.
2. AirSense 11 differences (`Identification.json`, file names, modes).
3. Derive sessions and mask-off periods from `STR.edf` `Mask On/Off` like OSCAR.
4. Import `RespRate`, `TidVol`, `MinVent`, `Snore`, `FlowLim` and the device oximeter (SAD).
5. Bi-level and ASV modes (`Mode` codes, `S.VPAP.*` / `S.AV.*` settings).
6. Check the 25 Hz flow against the 5 Hz-tuned breath analysis ([breathing-analysis.md](../breathing-analysis.md)); it is block-averaged to 5 Hz first.

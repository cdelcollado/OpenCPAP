# ADR-0010: Phase 4 design choices

- Status: accepted
- Date: 2026-10-09

## Context
Phase 4 adds analysis of the flow waveform, oximeter data, alerts and exports. The DreamStation 2 flow is a single 5 Hz int8 signal with no documented scale, so the well-known Glasgow-index approach (calibrated 25 Hz flow) cannot be copied.

## Decisions
1. **Scale-free breath metrics at 5 Hz.** Only shape and timing are used (breath rate, variation of length/volume, flat-topped share, I:E), never absolute volumes. They are labelled *experimental* and not presented as the Glasgow index. Rejected: inventing a calibration, or pretending the numbers equal AirwayLab's.
2. **Validated against the device's own events.** The flat-topped share is 11 % at baseline and 31 % in the minute before device-reported flow-limitation events on the real card. The periodic-pattern measure is documented as insensitive to brief episodes; no false positives were seen.
3. **Analysis runs in the import worker and is stored with the session**, with a versioned `analysis` field and a background backfill for sessions stored earlier, so the UI never recomputes from raw flow.
4. **Oximetry lives in two tables** (light statistics for the dashboard, samples loaded only on the night view) and is keyed by night. A recording is accepted for a night only if it covers ≥ 75 % of the CPAP use.
5. **Alerts are relative to the user's own history and the latest data**, thresholds are constants with tests on both sides of each edge, and the wording is neutral.
6. **Exports are plain files**: CSV with a formula-injection guard, EDF written by a small in-house writer (no dependency); the serial number is never exported.
7. **Schema v3 is additive**; backups gained two record types without a version bump (old readers skip them).

## Consequences
- Breath detection quality depends on a 5 Hz signal; fast or very shallow breathing is under-detected.
- Oximeter parsing has been tested on a synthetic layout only; real files from several brands are a roadmap item.
- Import takes ~23 s on the full real card (analysis included).

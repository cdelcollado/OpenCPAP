# Oximetry (SpO₂ and pulse from a separate oximeter)

The CPAP records **no oxygen data**. This feature lets you import the CSV export of your own pulse oximeter (a ring such as the Wellue/Viatom O2Ring family, a wrist or finger device) and see it on the same time axis as the therapy. Code: `packages/core/src/oximetry.ts`; UI in `features/oximetry/`; storage in `db/` (schema v3).

## Import
Import page → **Oximeter data (optional)** → choose the CSV. Nothing is stored until you press *Import*.

1. **The file is read in the browser** (up to 50 MB). The header is required; columns are found by name:
   | Column | Matches (case-insensitive) |
   |---|---|
   | time | `time`, `date`, `stamp` |
   | SpO₂ | `spo2`, `oxygen`, `o2`, `saturation` |
   | pulse (optional) | `pulse`, `pr`, `heart`, `bpm` |
   Separators `,` `;` and tab are detected.
2. **Time formats recognised**: `2026-03-05 23:00:01` / ISO `T`; `23:00:01 Mar 05 2026` (the layout of ViHealth exports, *unverified against a real file*); `Mar 05 2026 23:00:01`; and numeric `DD/MM/YYYY` or `MM/DD/YYYY` (also `.` and `-`) with 24 h or AM/PM times.
3. **Day/month order.** If any date in the file has a first or second number above 12 the order is known; otherwise it is ambiguous (`03/04/2026`), day-first is assumed and the page shows a checkbox *Read dates as month/day*.
4. **Invalid readings** (SpO₂ outside 50–100, pulse outside 20–250: sensors write 0 or 255 when the finger is off) become gaps; rows that cannot be read are counted and ignored; duplicate timestamps are dropped; samples are sorted.
5. **Clock correction.** The oximeter's clock and the CPAP's are compared **as written** (both are wall-clock without a zone). If they differ, enter the minutes to add (negative to subtract).
6. **Preview per night** shows how many minutes of the **CPAP night** the recording covers; "OK" needs ≥ 75 % of the CPAP use covered, otherwise it warns *check the dates and the clock correction*, and a night with no overlap is flagged in red. A recording that spans several nights is split noon-to-noon (a stray handful of samples after waking, < 60 samples, is dropped).
7. Importing again for a night **replaces** its previous oximetry.

## What is stored
Two IndexedDB tables ([storage.md](storage.md)): `oximetry` (night, source file name, start, end, correction, statistics) and `oximetrySamples` (times, SpO₂, pulse as typed arrays). The split keeps the light table small so the dashboard never loads sample arrays. Both are included in backups and removed by *Delete all data*; *Remove oximetry for this night* deletes one night.

## What is shown
- **Night tracks** *SpO₂* and *Pulse* aligned with the therapy tracks, with their values in the shared cursor readout.
- **Oximeter card**: average SpO₂, lowest SpO₂, time under 90 %, desaturations ≥ 3 % and ≥ 4 % per hour, pulse range and mean, hours of valid data, source file.
- **References** ([reference-ranges.md](reference-ranges.md)): ODI4 has a three-state badge (within range below 5 per hour, attention from 5, out of range from 15; adult sleep-lab bands, unverified). The other figures show a note that no verified reference exists.
- **Plain-language summary** sentences: frequent desaturations (≥ 5 per hour), time under 90 % (≥ 5 % of the recording), or steady oxygen. Only for recordings with ≥ 1 h of valid data.
- Columns in the nights CSV, a per-night **Oximetry (CSV)** export, and a line in the clinician report ([report.md](report.md)).

## Definitions (`oximetryStats`)
- **Valid time** = sum of the seconds each valid SpO₂ sample stands for (until the next sample, capped at 30 s so a gap is not data).
- **Average / lowest SpO₂**: time-weighted mean and minimum of the valid values. **T90 / T88**: share of valid time under 90 % / 88 %.
- **Desaturation** (`findDesaturations`): SpO₂ falls at least *X* points (3 or 4) below the **baseline**, defined as the 90th percentile of the previous 120 s, for **10 s to 3 min**; the event ends when SpO₂ is back within half the drop of the baseline. Slow drifts and blips shorter than 10 s are ignored.
- **ODI** = desaturations per hour of valid time.
- **Pulse**: time-weighted mean, minimum, maximum of the valid values.
These definitions follow common practice but differ between devices and software (sensor averaging, baseline rules); compare numbers with your own earlier nights, not with other people's reports.

## Validation and limits
- **Unit tests** use synthetic recordings with known dips (10 dips of 3–4 points in an hour give ODI3 = 10 and ODI4 = 6), slow drifts, gaps, invalid values and every date layout above (`oximetry.test.ts`, 15 tests). The demo data includes fictitious oximetry whose dips follow the demo apneas.
- **Not validated on a real oximeter file**: no file was available during development. The ViHealth/Wellue layout is implemented from its commonly documented form and must be confirmed with a real export; please open an issue with a (de-identified) sample if it does not load.
- The recording is the oximeter's, not the CPAP's; averaging and sampling intervals (1 s to 4 s) depend on the device.
- Oxygen findings are information, not diagnosis.

# Exports

Everything is generated in the browser from the stored data and saved through the browser's download; nothing is sent anywhere. Code: `apps/web/src/exports.ts`, `packages/core/src/edf.ts`.

| Where | Button | File | Content |
|---|---|---|---|
| Dashboard | **Export nights (CSV)** | `opencpap-nights.csv` | One row per night: `date, usage_hours, ahi, obstructive, central, hypopnea, rera, flow_limitation, leak_p95_lmin, leak_median_lmin, leak_max_lmin, pressure_min_cmh2o, pressure_max_cmh2o, breath_rate_per_min, flat_breaths_pct, periodic_pattern_pct, spo2_mean_pct, spo2_min_pct, time_under_90_pct, odi3_per_h, odi4_per_h` (21 columns) |
| Night | **Events (CSV)** | `opencpap-events-<date>.csv` | `session, start, type, detail, duration_s` (one row per event; `detail` is e.g. `alt-hypopnea`) |
| Night | **Statistics (CSV)** | `opencpap-statistics-<date>.csv` | Long format `session, time, channel, unit, value` for the device's per-interval statistics (leak, snore, pressure) |
| Night | **Flow (EDF)** | `opencpap-flow-<date>.edf` | The flow waveform as a 16-bit EDF file (5 Hz, one-second records) |
| Night (with oximetry) | **Oximetry (CSV)** | `opencpap-oximetry-<date>.csv` | `time, spo2_pct, pulse_bpm`; invalid readings are empty |

Conventions:
- **Decimal point, no thousands separators, no locale formatting**, so spreadsheets in any language parse them; CRLF line ends; header row always present.
- **Times are the device's clock without a time zone**: `2026-03-05T22:07:09`. (The device records wall-clock time only.)
- **CSV injection**: a text cell that starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with an apostrophe so a spreadsheet does not run it as a formula. Quotes and commas are escaped by RFC 4180 quoting. Notes are **not** included in any CSV.
- The nights CSV contains every night stored, regardless of the selected range.

## EDF details
- Format: European Data Format 16-bit, **one signal, label `Flow`**, 5 samples per one-second data record, physical range −128…127 mapped linearly onto 16-bit digital values (the device's samples are 8-bit signed, so no information is lost).
- The **physical dimension is left empty**: the unit of the device's flow numbers is not verified ([formats/ds2.md](formats/ds2.md)); the values are the device's own.
- Start date/time are the first sample's wall-clock fields. **Gaps between flow segments are filled with zeros** (this is continuous EDF, not EDF+ with annotations).
- The file opens in EDFbrowser and similar tools. `edf.test.ts` writes files and reads them back with an independent minimal reader.

## Not exported (yet)
Backup/restore is a separate full-fidelity format ([backup-format.md](backup-format.md)). A JSON export of the night summaries and an EDF+ with annotations for events are possible follow-ups.

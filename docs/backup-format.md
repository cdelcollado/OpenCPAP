# Backup file format

Implementation: `apps/web/src/db/backup.ts` (tests: `backup.test.ts`). The Settings page offers **Download backup** and **Restore from a backup**.

## What is saved
| Content | Included | Notes |
|---|---|---|
| Sessions (settings, events, mask slices, statistics series) | always | everything the dashboard needs |
| Flow waveforms | optional ("Include detailed flow data") | large (tens of MB for a year of nights); can always be re-imported from the SD card, so off by default |
| Journal (notes, tags, mood) | always | |
| Equipment items | always | |
| Oximetry (statistics and samples) | always | the samples are large for a long recording but compress well |
| Language/theme and the report's patient name | no | per-browser preferences in `localStorage` |

## File
Extension `.opencpap`. The file is **gzip-compressed NDJSON** (one JSON object per line). If the browser has no `CompressionStream`, an uncompressed `.opencpap` is written; the reader accepts both (it checks for the gzip magic bytes `1f 8b`).

```
{"format":"opencpap-backup","version":1,"createdAt":"2026-10-09T18:30:00.000Z","app":"0.0.0","includesWaveforms":false}
{"t":"session","row":{ "key":"…","deviceId":"…","night":"2026-10-08","start":…,"session":{ … }}}
{"t":"waveform","row":{ "key":"…#0","sessionKey":"…","waveform":{ … }}}
{"t":"journal","row":{ "date":"2026-10-08","note":"…","tags":["cold"],"mood":4,"updatedAt":… }}
{"t":"equipment","row":{ "id":"…","kind":"mask","name":"…","startDate":"2026-05-01","intervalDays":180,"updatedAt":… }}
{"t":"oximetry","row":{ "date":"2026-10-08","source":"ring.csv","start":…,"end":…,"offsetMin":0,"stats":{ … },"importedAt":… }}
{"t":"oximetrySamples","row":{ "date":"2026-10-08","times":{"$ta":"Float64Array","b64":"…"},"spo2":{ … },"pulse":{ … } }}
```
- Line 1 is the header. `version` is the format version (currently 1); a reader refuses files with a higher version.
- Typed arrays are stored as `{"$ta":"Float32Array","b64":"…"}` (also `Float64Array`); anything else is rejected.
- Records follow the IndexedDB row shapes of [storage.md](storage.md); the format version moves independently of the database schema version.

**Why NDJSON?** A year of data with flow is far larger than a single JSON string can hold (browsers cap strings at ~512 MB). Writing and reading line by line, through `CompressionStream`/`DecompressionStream`, keeps memory bounded and lets a restore fail on one bad line without losing the rest.

## Restoring
`importBackup(db, blob)`:
1. Reads the header; anything that is not an `opencpap-backup` file, or has a newer version, or is empty, is refused with a clear message **before any data is written**.
2. For each line it parses and **validates** the record (types, date format, typed arrays present). Invalid or unknown records are **skipped and counted**, never trusted; the UI reports the count.
3. Oximetry metadata is replaced only when the backup's `importedAt` is newer; its samples are accepted **only for nights whose metadata was accepted from the same backup**, so metadata and samples never come from different recordings. Sessions and waveforms **replace** rows with the same key (idempotent). Journal entries and equipment items are replaced **only if the file's copy is newer** (`updatedAt`), so restoring an old backup does not overwrite newer notes made since.
4. Rows are written in batches of 100 to bound memory.
5. A decompressed-size limit (1.5 GB) stops decompression bombs.

## Security and privacy
- The file is **not encrypted** and contains health data and the device serial number. Keep it somewhere private (the Settings page says so). Encrypted backups are a possible follow-up.
- Reading is defensive: records are validated, nothing from the file is evaluated, and text is only ever displayed through React (escaped) or `textContent`.

## Compatibility rules for future versions
- Adding optional fields to rows is backwards compatible (older readers ignore them). Phase 4 added the two oximetry record types and `analysis` inside sessions without bumping `version`: an older reader skips unknown record types (counted as skipped) and ignores the extra session field.
- Changing the meaning of a field, renaming, or removing one requires a new `version`; keep a reader for every version ever released.
- Add a fixture (a small generated backup for the old version) to the tests when bumping.

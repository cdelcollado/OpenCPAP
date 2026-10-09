# Local storage

All user data is stored in the browser's **IndexedDB**, via [Dexie](https://dexie.org). Nothing is sent to a server. Code: `apps/web/src/db/`.

## Database `opencpap` (schema version 2)

| Store | Primary key | Indexes | Row |
|---|---|---|---|
| `sessions` | `key` = `<manufacturer>:<serial>/<session id>` | `night`, `start`, `deviceId` | `{ key, deviceId, night, start, session }` where `session` is a `SessionLite` (a `Session` without waveforms) |
| `waveforms` | `key` = `<session key>#<segment index>` | `sessionKey` | `{ key, sessionKey, waveform }` — one contiguous `Waveform` segment (`Float32Array`) |

| `journal` | `date` (the night, YYYY-MM-DD) | — | `{ date, note, tags[], mood?, updatedAt }`; one entry per night; an entry with no note, tags or mood is deleted rather than stored; note ≤ 5000 chars, ≤ 20 tags of ≤ 40 chars |
| `equipment` | `id` (UUID) | `kind`, `startDate` | `{ id, kind, name, startDate, endDate?, intervalDays, note?, updatedAt }` |

- **Why two stores for therapy data?** The dashboard needs only light session data for ~hundreds of sessions; flow waveforms (≈130–160 k samples per night) are loaded only when a night is opened.
- **Typed arrays** (`Float32Array`, `Float64Array`) are stored natively by IndexedDB (structured clone) — no conversion.
- `night` is precomputed with `nightOf(start)` so a night's sessions can be fetched by index.
- **Idempotence.** `saveSession` runs in one transaction: delete old waveforms of the key, `put` the session, `bulkPut` waveforms. Re-importing replaces rather than duplicates; sessions for different devices never collide because the device is part of the key.
- **Demo data** uses the fictitious device `Demo:DEMO-0001` and can be deleted on its own (`deleteDevice`).

## Schema history
| Version | Change | Migration |
|---|---|---|
| 1 | `sessions`, `waveforms` (Phase 2) | — |
| 2 | adds `journal` and `equipment` (Phase 3) | none needed: purely additive, existing rows untouched. A test creates a version-1 database, opens it with the current code and checks that data survives |

## `Repository` API
`saveSession`, `listSessions`, `nights()` (all night summaries), `night(date)` (sessions + waveforms for one night), `counts`, `devices`, `deleteDevice` (therapy data of one device only), `clearAll` (**everything**, including notes and equipment), `sessionKeysWithWaveforms`, and for Phase 3 `journal`/`saveJournal`/`deleteJournal` and `equipment`/`saveEquipment`/`deleteEquipment`. Backups: [backup-format.md](backup-format.md). Components never touch Dexie directly, so the schema can change in one place.

## Size
Sample card (550 sessions, ~190 nights with waveforms): a few tens of MB. `Settings` shows `navigator.storage.estimate()`. Browsers may evict storage for sites that are not installed or persistent; installing the PWA makes eviction less likely. Settings has a **Request persistent storage** button (`navigator.storage.persist()`, outcome shown) and a **backup** download/restore ([backup-format.md](backup-format.md)).

## Changing the schema
1. Add `this.version(N).stores({...})` with an `.upgrade()` callback that migrates rows.
2. Keep older `version()` declarations so existing users upgrade in place.
3. Add a repository test that opens a database created with the previous version (use `fake-indexeddb`).
4. Document the change here and in the changelog.

## Privacy notes
- Notes and equipment live in the same database and have the same protection. Backup files are **not encrypted** either.
- Data is **not encrypted at rest** (the browser profile is the trust boundary). Anyone with access to the user's browser profile can read it. The settings page lets the user delete everything.
- Serial numbers are part of the keys and rows (local only). Never log or export them to shared places.
- Private/incognito windows discard the data when closed; the app works but keeps nothing.

## Tests
`db/repository.test.ts` runs against `fake-indexeddb`: storage and night grouping, idempotent re-import, waveform replacement, typed-array round trip, multi-device isolation and deletion, clearing.

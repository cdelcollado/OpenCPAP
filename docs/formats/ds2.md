# Philips Respironics DreamStation 2 — SD card format

**Sources:** OSCAR's PRS1 loader (`oscar/SleepLib/loader_plugins/prs1_loader.cpp`, class `PRDS2File`; GPLv3) and direct inspection of one real card (DreamStation 2 Advanced CPAP, model `420X150C`, firmware `V1.0.6`). Items not yet confirmed are marked *unverified*.

Implementation: `packages/loaders/philips-ds2/src/container.ts`. Tests: `container.test.ts` (synthetic container).

## 1. Card layout

```
P-SERIES/                      (OSCAR also accepts P-Series / p-series: match case-insensitively)
  LAST.TXT                     text pointer to the latest device folder (unverified semantics)
  <DEVICE_ID>/                 8 hex chars; one folder per device that used the card
    PROP.BIN                   encrypted device properties
    LOG.SEQ                    encrypted (contents unverified)
    D/NNN.B03                  device-level records (settings/log) — unverified
    E/NNN.B04                  device-level event records — unverified
    P0/ P1/ P2/                therapy sessions, sharded across folders
      XXXXXXXX.B01             per-session small record (~354 B encrypted)
      XXXXXXXX.B02             per-session events/statistics (~1–2 KB)
      XXXXXXXX.B05             per-session waveform data (~100 KB+)
    U/                         empty on the sample card
```

Observations from the sample card: `PROP.BIN` reports `PFN=191`, which equals the number of files in the newest folder (`P2`; `P0` and `P1` hold 500 and 498 files), `EFN=5` equals the files in `E`, and `DFN=13` equals the files in `D`. So `PFN` counts the files of the current `P<n>` folder, not all sessions. The card holds 550 session ids in total. Session file basenames are 8 hex digits and are sequential session ids; folders `P0`→`P1`→`P2` fill up in order (about 500 files each).

OSCAR detection: if a `P-SERIES` folder exists, it is a PRS1-family card; a device folder containing `PROP.BIN` indicates DreamStation 2.

## 2. Encrypted container

All files above (`*.BIN`, `*.B0x`, `LOG.SEQ`) share one container. Integers are little-endian. A *field* is `u16 length` followed by `length` bytes.

| Offset | Field | Size | Notes |
|---|---|---|---|
| 0x00 | magic part 1 | u16 | `0x000D` |
| 0x02 | magic part 2 | u16 | `0x0001` |
| 0x04 | magic part 3 | u16 | `0x0001` |
| 0x06 | GUID | field (36 B) | ASCII UUID, constant across files of the same device (treat as sensitive) |
| 0x2E | IV | field (12 B) | 96-bit GCM nonce, shared by key and payload operations |
| 0x3C | salt | field (16 B) | PBKDF2 salt |
| 0x4E | reserved A | u16 | `0` |
| 0x50 | reserved B | u16 | `1` |
| 0x52 | import key | field (32 B) | payload key encrypted with a device-specific key; **unused** |
| 0x74 | import key tag | field (16 B) | GCM tag for the above |
| 0x86 | export key | field (32 B) | payload key encrypted with the salted common key |
| 0xA8 | export key tag | field (16 B) | GCM tag |
| 0xBA | payload tag | field (16 B) | GCM tag of the body |
| 0xCA | **body** | rest | AES-256-GCM ciphertext (header size is exactly `0xCA`) |

### 2.1 Key derivation
1. `commonKey = AES-256-ECB-decrypt(key = "Patient access to their own data", data = COMMON_KEY[32])` (two independent 16-byte blocks, no padding). `COMMON_KEY` is a constant published in OSCAR's source.
2. `saltedKey = PBKDF2-HMAC-SHA256(password = commonKey, salt, iterations = 10000, dkLen = 32)`.
3. `payloadKey = AES-256-GCM-decrypt(key = saltedKey, iv, ciphertext = exportKey, tag = exportKeyTag)`.
4. `plaintext = AES-256-GCM-decrypt(key = payloadKey, iv, ciphertext = body, tag = payloadTag)`.

Derived `payloadKey`s repeat across many files (same `iv‖salt‖exportKey‖tag`), so they are cached.

### 2.2 Edge cases
- OSCAR tolerates a payload tag of all zeros by decrypting without verification and relying on the plaintext's internal CRC (observed on some firmware). **Not implemented yet** — we currently reject on tag mismatch. Revisit if real cards trigger it.
- Empty files must be skipped (OSCAR logs and skips).
- A truncated header or unexpected magic/length must raise a clear error (implemented).

## 3. Plaintext content

### 3.1 `PROP.BIN`
UTF-8 text, one `KEY=value` line per property, e.g.:

| Key | Meaning (partly *unverified*) |
|---|---|
| `SN` | Serial number (**sensitive**) |
| `MN` | Model number (`420X150C`) |
| `SV` | Software/firmware version |
| `CF` | Product family code (`6` = DreamStation 2 in OSCAR's table) |
| `FD`, `LD` | First / last data timestamp, epoch seconds |
| `PFN`, `EFN`, `DFN` | Number of `P`, `E`, `D` files |
| `SID` | Session-id related list |
| `VC` | Checksum/version code (unverified) |
| `BK`, `SK`, `EK`, `DK`, `TS`, `DC`, `PT`, `DF`, `DFV`, `F`, `FV`, `FN` | Unknown/undocumented (unverified) |

OSCAR maps long names to short keys through `s_longFieldNames`; see the loader for the complete list.

### 3.2 File types
The extension digit is the PRS1 "file number" (the same number older devices use as `.001`, `.002`, …):

| Extension | Location | Content | Status |
|---|---|---|---|
| `B01` | `P*/` | Session **summary**: mask on/off times, settings, device statistics | parsed |
| `B02` | `P*/` | Session **events** (apneas, hypopneas, leak, …) and periodic statistics | parsed |
| `B05` | `P*/` | Session **flow waveform** | parsed |
| `B06` | `P*/` | Oximetry waveform (OSCAR); not present on the sample card | not implemented |
| `B03` | `D/` | Device-level records ("equipment"/settings log) | chunks validate, not interpreted |
| `B04` | `E/` | Device-level event records | chunks validate, not interpreted |

A session is identified by the 8-hex-digit basename; its `B01`, `B02`, `B05` share the id and live in the same `P<n>` folder. A session without a `B01` cannot be interpreted (no settings or mask times) and is skipped, as OSCAR does.

## 4. Chunk framing (verified: 24 154 chunks, 0 errors)

A decrypted file is a concatenation of **chunks**. Integers are little-endian. This is the generic PRS1 framing; DS2 files use `fileVersion = 3`, `family = 0`, `familyVersion = 6`.

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 1 | `fileVersion` | 2 or 3 supported |
| 1 | 2 | `blockSize` | whole chunk length incl. header, checksum and CRC |
| 3 | 1 | `htype` | `0` normal, `1` waveform/interval |
| 4 | 1 | `family` | `0` = CPAP/APAP ("xPAP") |
| 5 | 1 | `familyVersion` | `6` on DS2 |
| 6 | 1 | `ext` | file number (1, 2, 3, 4, 5, …) |
| 7 | 4 | `sessionId` | |
| 11 | 4 | `timestamp` | seconds; see "Clock" below |
| 15 | … | variable header | see below |
| … | 1 | header checksum | 8-bit sum of all header bytes before it |
| … | … | payload | |
| end−4 | 4 | payload CRC | CRC-32/MPEG-2 over the payload bytes, each byte treated as a 32-bit word `00 00 00 bb` (init `0xFFFFFFFF`, MSB first, poly `0x04C11DB7`) |

(`fileVersion = 2` ends with a 2-byte CRC-16/KERMIT instead; not seen on DS2.)

**Variable header, normal chunks (`htype 0`, `fileVersion 3`):** one byte `n`, then `n` pairs `(recordCode, recordSize)`. This table tells the parser how many bytes each record type occupies in *this* chunk; sizes vary between devices and firmware, so parsers must never hard-code them.

**Variable header, waveform chunks (`htype 1`):** `u16 intervalCount`, `u8 intervalSeconds`, `u8 signalCount`, then `signalCount` entries of `(kind u8, interleave u16, sampleBits u8)` (always 8), then one trailing zero byte.

**Clock.** Timestamps are wall-clock time of the device with no time-zone information. OSCAR treats them as local time; so do we (`Session.clock = 'device-local'`). Sample card sessions start around 20:00–22:30 in this reading, consistent with bedtime in the owner's zone.

## 5. Summary records (`B01`)
Payload = sequence of `recordCode, bytes[hblock[recordCode]]`. Times are `u16` seconds **elapsed since the previous timed record** and accumulate into `tt`.

| Code | Meaning | Handling |
|---|---|---|
| `0x00` | Equipment on | marker, ignored |
| `0x01` | Settings | nested `(code, length, value…)` list, see §6 |
| `0x03` | Mask on | `tt += u16`; starts a mask-on slice. Bytes 2–3 hold a humidifier setting pair |
| `0x04` | Mask off | `tt += u16`; ends the slice |
| `0x02` | Equipment off | `tt += u16`; ends the session (rest of the record unused) |
| `0x09` | Time elapsed | `tt += u16` |
| `0x0A` | Humidifier setting changed | `tt += u16`; bytes 2–3 humidifier pair |
| `0x0B` | CPAP-Check related | `tt += u16` |
| `0x08` | **Device statistics**, one per mask-on period | see below |
| `0x05`, `0x06`, `0x07`, `0x0C`, `0x0D`, `0x0E` | Pressure/auto-titration related, unknown | ignored |

Session end = chunk `timestamp` + final `tt`. Mask-on time is the sum of `mask-on` slices (slices run until the next timed record).

### Device statistics record (`0x08`) — verified
`u16` words, little-endian, starting at the record's first byte:

| Word | Content | Verification |
|---|---|---|
| 1 | obstructive apnea count | equal to parsed events in 333/333 sessions |
| 2 | unknown (0 or small numbers) | — |
| 3 | central (clear airway) apnea count | verified |
| 4 | unknown (looks like minutes of something) | — |
| 7 | unknown | — |
| 8 | hypopnea count (excluding events stored under code `0x0B`) | verified |
| 10 | RERA count | verified |
| 11 | flow limitation count | verified |
| 12, 13, 14 | unknown (e.g. `9005`, `104`, `4352`) | — |

A session with several mask-on periods has several records; counts are summed.

## 6. Settings (`B01` record `0x01`)
Nested list of `code u8, length u8, value[length]`. Implemented in `summary.ts`:

| Code | Setting | Encoding |
|---|---|---|
| `0x00` | Mode | 0 CPAP, 1 Bi-Level, 2 Auto-CPAP, 3 Auto-BiLevel, 4 CPAP-Check |
| `0x0A` | CPAP pressure | value × 0.1 cmH₂O |
| `0x0C` | CPAP-Check | min, max, pressure (×0.1) |
| `0x0D` | Auto-CPAP | min, max (×0.1) |
| `0x0E` | Bi-Level | EPAP, IPAP (×0.1); PS derived |
| `0x0F` | Auto-BiLevel | EPAP min, IPAP max, PS min, PS max (×0.1) |
| `0x10` | Auto-Trial | days, min, max |
| `0x2A`/`0x42` | EZ-Start | non-zero = on |
| `0x2B` | Ramp type | 0 linear, `0x80` SmartRamp (Ramp+ when only a ramp time is present) |
| `0x2C` | Ramp time | minutes; 0 = off |
| `0x2D` | Ramp pressure | ×0.1 cmH₂O |
| `0x2E` | Flex mode | 0 none, `0x80` flex, `0x90` flex+/A-Flex, `0xA0` rise time, `0xB0` P-Flex |
| `0x30` | Flex level | |
| `0x35` | Humidifier | two bytes, see below |
| `0x38` | Mask resistance | 0 = off |
| `0x3B`/`0x40`/`0x46` | Tubing | 0 → 22 mm, 1/2 → 15 mm, 3/4 → 12 mm |
| `0x3C`/`0x4B` | Show AHI on device | |
| `0x3E`/`0x3F` | Auto on / auto off | |
| `0x4A` | Patient controls access (DS2) | |

Humidifier pair `(b1, b2)`: `b1 >> 5` mode (0 fixed, 1 adaptive, 2 heated tube, 3 passover, 4 no humidifier, 5 error); `(b1 >> 2) & 7` humidity level; `(b2 >> 5) & 7` heated-tube temperature.

Ignored (understood only by OSCAR as lock flags or unknown): `0x01`, `0x2F`, `0x36`, `0x39`, `0x43`, `0x44`, `0x45`, `0x48`.

## 7. Event records (`B02`) — verified against §5
Payload = sequence of `recordCode, bytes[hblock[recordCode]]`. Every record except `0x12` starts with a `u16` elapsed-seconds value added to the running time `t` (relative to the chunk `timestamp`).

| Code | Event | Data after timestamp | Time rule |
|---|---|---|---|
| `0x01` | Pressure set (CPAP) | pressure ×0.1 | at `t` |
| `0x02` | Pressure set (Bi-Level) | EPAP, IPAP (×0.1) | at `t` |
| `0x05` | RERA | `elapsed` | `t − elapsed` |
| `0x06` | Obstructive apnea | `elapsed` | `t − elapsed`, duration 0 |
| `0x07` | Central apnea | `elapsed` | `t − elapsed`, duration 0 |
| `0x14`, `0x15`, `0x0A` | Hypopnea | `elapsed` | `t − elapsed`; **counted by the device** (`0x14` is the only one seen) |
| `0x0B` | Hypopnea (alternate) | `?`, `elapsed` | `t − elapsed`; **not** in the device's own count (§5) — exposed as `detail: 'alt-hypopnea'` |
| `0x0C` | Flow limitation | `elapsed` | `t − elapsed` |
| `0x0D` | Vibratory snore | — | at `t` |
| `0x0E` | Variable breathing | `u16 halfDuration`, `elapsed` | duration `2×halfDuration`, start `t − elapsed − duration` |
| `0x0F` | Periodic breathing | same as above | same |
| `0x10` | Large leak | same as above | same |
| `0x11` | Statistics (every ~2 min) | total leak (L/min), snore count, average pressure (×0.1) | at `t` |
| `0x03`, `0x04`, `0x12` | Auto-CPAP start pressure, pressure pulse, snores per pressure | | not interpreted |

Zero-length periodic/variable/large-leak spans are dropped (a leak span can start just before a new mask-on).

## 8. Waveforms (`B05`)
On the sample card there is a **single signal per chunk**: flow, 5 samples/s (`interleave 5`, `intervalSeconds 1`), 8-bit **signed** values. Pressure and other channels are not stored as waveforms on DS2 (pressure comes from the event records). OSCAR treats the value as L/min with gain 1; the exact physical scaling is *unverified*. Chunks that are contiguous (next start equals previous end within 1 s of clock jitter) are concatenated into one `Waveform`; gaps start a new one.

## 9. Findings on the sample card
- 550 sessions have a summary; 333 also have events. The oldest sessions (2025) are summary-only; events appear from January 2026 and flow waveforms from February 2026 on this card, so detailed data seems to be retained only for a limited recent period (or recorded only after a firmware/setting change) — *unverified*.
- Events for a session are in a single `B02` chunk on the sample.
- Statistics records (`0x11`) arrive about every 2 minutes (244 records for an 8.1 h session).
- Zero unknown record codes were encountered in summaries or events.

## 10. Cross-validation
`real-card.test.ts` (runs only when `fixtures/raw/P-SERIES` exists) compares, per session, the event counts parsed from `B02` with the counts the device wrote in its own statistics record: **333 sessions × 5 event types, 0 mismatches** after (a) summing one record per mask-on period, (b) using word 3 for central apneas, and (c) excluding code `0x0B` hypopneas. This is an independent check on the event parser; comparison of usage hours/AHI/P95 with OSCAR's own output is still pending (see roadmap).

## 11. Open questions
- [ ] Meaning of statistics words 2, 4, 7, 12–14; code `0x0B` hypopnea semantics (OSCAR also marks this as unknown).
- [ ] Physical scaling of the flow samples.
- [ ] Content of `D/B03` and `E/B04` records and `LOG.SEQ`.
- [ ] Time-zone / DST behaviour of the device clock.
- [ ] Zero-tag handling decision (see §2.2).
- [ ] Oximetry (`B06`), other DS2 variants (410, 520, 521) and ventilator families.

## 12. Verification log
| Date | Check | Result |
|---|---|---|
| 2026-10-09 | Decrypt `PROP.BIN` from a real card | OK; plaintext is `KEY=value` lines |
| 2026-10-09 | Decrypt all 1 207 `.B0x` files | OK |
| 2026-10-09 | Header checksum and payload CRC of 24 154 chunks | 0 errors |
| 2026-10-09 | Parsed events vs. device statistics (333 sessions) | 0 mismatches |
| 2026-10-09 | Synthetic round-trip tests (container, chunk, parsers, loader) | OK |

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

Observations from the sample card (counts match `PROP.BIN`): 191 session ids in `P*` (`PFN=191`), 5 `E` files (`EFN=5`), 13 `D` files (`DFN=13`). Session file basenames are 8 hex digits and appear to be sequential session ids; the `P0/P1/P2` folder holds a contiguous range of ids.

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

### 3.2 `*.B0x` session and device files
Decrypted bodies are PRS1 **chunk streams**, the same family parsed by OSCAR in `prs1_parser.cpp` and `prs1_parser_xpap.cpp` (DS2 is "family 6"). A decrypted `.B01` begins `03 98 00 00 00 06 01 45 …` — the leading bytes look like a chunk header (version byte, length, family/type). Detailed chunk header layout, event codes and waveform encodings are the subject of Phase 1 and will be documented here.

## 4. Phase 1 documentation TODO
- [ ] Chunk header fields (version, length, family/family-version, type, timestamps, CRC) with offsets
- [ ] Meaning of `B01` / `B02` / `B05` / `B03` / `B04`
- [ ] Event type code table and parameters
- [ ] Waveform encoding (sample rate, scaling, delta encoding if any)
- [ ] Settings encoding for each therapy mode
- [ ] Timezone and clock handling
- [ ] Zero-tag handling decision

## 5. Verification log
| Date | Check | Result |
|---|---|---|
| 2026-10-09 | Decrypt `PROP.BIN` from a real card | OK; plaintext is `KEY=value` lines |
| 2026-10-09 | Decrypt a session `.B01` | OK; 152 bytes of plaintext |
| 2026-10-09 | Synthetic container round-trip test | OK (3 tests) |

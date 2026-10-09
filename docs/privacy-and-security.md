# Privacy and security

## Principles
1. CPAP data is health data. Default behavior: **nothing leaves the browser.**
2. No analytics, no third-party scripts that see user data, no remote fonts that leak usage.
3. Any future network feature (sharing, sync, LLM) is opt-in, explained in the UI, and end-to-end encrypted where applicable.

## Repository hygiene
- `fixtures/raw/` contains real SD data and is git-ignored. Never force-add it.
- Device serial numbers, GUIDs and file dumps must not appear in commits, issues, logs, tests or docs.
- Committed test fixtures must be synthetic or produced by the (planned) SD anonymizer.

## The DS2 "encryption"
The DreamStation 2 encrypts files with AES-256-GCM, but the key material is derivable from a public constant and per-file header fields (see [formats/ds2.md](formats/ds2.md)). It is obfuscation that restricts access for patients, not a confidentiality control. OpenCPAP uses it solely to let patients read their own data. The key-derivation constants come from OSCAR's GPLv3 source.

## User-written data (Phase 3)
- **Notes, tags, mood and equipment** are stored only in this browser (IndexedDB), like therapy data. They appear in **backups** (always) and in the **printed report** only if the user ticks "Include my notes and tags" (off by default).
- The report's **patient name** is kept in `localStorage` for convenience and never stored in the database or backups.
- **Backups are not encrypted**; they contain health data and the device serial number. The Settings page warns about it. If encryption is added later it must be optional and passphrase-based (never a key stored in the browser).
- Backup restore treats the file as untrusted input: validated rows only, size limits, no code evaluation ([backup-format.md](backup-format.md)).
- Printing is done by the browser; nothing is sent anywhere.

## Threat model (browser app)
- Malicious SD card or ZIP contents: file sizes are capped (`MAX_FILE_BYTES`), ZIP entries are inflated one at a time after checking their declared size, and paths are only used as map keys. Parsing runs in a Web Worker, isolated from the page.
- Malicious SD card contents: parsers must bounds-check every length field, cap allocations, and never `eval` or interpolate file content into HTML.
- Supply chain: pin dependency versions, prefer audited crypto (`@noble/*`), review lockfile changes.
- Local storage: data in IndexedDB is unencrypted at rest (see [storage.md](storage.md)); the browser profile is the trust boundary. Settings offers per-device and full deletion. The service worker caches only the app's static files, never user data.
- The web app loads no third-party scripts, fonts or analytics; the content security of the build relies on that (no CDN requests at runtime).

## Regulatory note
Informational software; not a medical device. If a backend or clinician features are added, revisit GDPR and applicable medical-device rules.

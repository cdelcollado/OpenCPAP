# Privacy and security

## Principles
1. CPAP data is health data. Default behavior: **nothing leaves the browser.**
2. No analytics, no third-party scripts that see user data, no remote fonts that leak usage.
3. Any future network feature (sharing, sync, LLM) is opt-in, explained in the UI, and end-to-end encrypted where applicable.

## Self-hosting
When the app is served from your own server ([deployment.md](deployment.md)), the server only delivers the static build. It receives no health data, has no logs of user data and runs no application code. Access logging is nginx's default, which records requests for files, not any content the user has imported. Keep the server on your local network unless you add HTTPS and access control yourself.

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

## Phase 4 data
- **Oximeter files** are read in the browser and stored in IndexedDB like therapy data; they are in backups and removed by *Delete all data*. File names are kept as the "source" label.
- **Breath analysis** is derived from data already on the device; nothing is uploaded.
- **Exports** (CSV, EDF) contain health data and are written wherever the browser downloads; they have no notes. The serial number is not included in any export. Treat the files like the card contents.

## Phase 6: sharing and language models
- **Share links** put a snapshot (figures only; no notes, equipment or serial) in the URL fragment. Nothing is uploaded, but a link is the data: anyone who gets it can read it, it cannot be revoked, and chat apps that preview links may see the fragment. Optional passphrase encryption helps only if the passphrase travels separately ([sharing.md](sharing.md)). Incoming links are validated and size-limited, and shown as text.
- **Written summaries** are off by default. When enabled they send aggregate figures (no dates of nights, notes, names or serials) only to the address the user entered; non-local addresses need explicit consent ([llm-summaries.md](llm-summaries.md)). Settings live in `localStorage` (`opencpap.llm`).
- The JSON summary export contains figures only.
- There is still no telemetry, account or default network destination.

## Threat model (browser app)
- Malicious SD card or ZIP contents: file sizes are capped (`MAX_FILE_BYTES`), ZIP entries are inflated one at a time after checking their declared size, and paths are only used as map keys. Parsing runs in a Web Worker, isolated from the page.
- Malicious SD card contents: parsers must bounds-check every length field, cap allocations, and never `eval` or interpolate file content into HTML.
- Supply chain: pin dependency versions, prefer audited crypto (`@noble/*`), review lockfile changes.
- Local storage: data in IndexedDB is unencrypted at rest (see [storage.md](storage.md)); the browser profile is the trust boundary. Settings offers per-device and full deletion. The service worker caches only the app's static files, never user data.
- The web app loads no third-party scripts, fonts or analytics; the content security of the build relies on that (no CDN requests at runtime).

## Regulatory note
Informational software; not a medical device. If a backend or clinician features are added, revisit GDPR and applicable medical-device rules.

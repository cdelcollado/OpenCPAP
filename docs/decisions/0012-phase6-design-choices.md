# ADR-0012: Phase 6 design choices (sharing and connectivity)

- Status: accepted
- Date: 2026-10-09

## Context
The plan for Phase 6 lists end-to-end-encrypted share links, a Wi-Fi SD companion, MQTT/Home Assistant, and opt-in language-model summaries, all marked optional. The project has no backend and the product principle is that health data never leaves the device unless the user chooses.

## Decisions
1. **Sharing is serverless: the link carries the data in the URL fragment** ([sharing.md](../sharing.md)). Rejected: a hosted share service (needs infrastructure, accounts, GDPR obligations and a trust relationship that contradicts "local-first"); end-to-end encryption with the key in the fragment and ciphertext on a server (still needs the server). The cost is that links cannot be revoked or expire, which the UI and docs state plainly.
2. **Snapshots carry figures only**, never notes, equipment, serial numbers or waveforms, and the patient name only if the user typed it into the report. The viewer reuses the printable report so the numbers are identical to the sender's.
3. **Optional passphrase encryption with WebCrypto** (PBKDF2-SHA-256, 250 000 iterations, AES-256-GCM, fresh salt and IV). No new dependency. The weakness of short passphrases is documented, as is the leak through chat apps that preview links.
4. **Incoming links are hostile input**: strict validation and size limits, text rendered as React text, fields truncated.
5. **The language-model summary is opt-in, user-supplied and local first.** No hosted AI service is bundled. Remote servers need an explicit, per-address consent. Only aggregates are sent, and a test asserts the absence of dates and identifiers. The model is told not to diagnose or advise, but output is not verified, which the card says. Rejected: bundling WebLLM/WASM (large downloads, uneven quality) — can be revisited.
6. **MQTT/Home Assistant and Wi-Fi SD sync are not built into the web app** ([integrations.md](../integrations.md)). A browser tab cannot run unattended or read a card by itself. What ships is a stable JSON summary (`opencpap-summary/1`) and a design for a Node/Tauri companion built on the existing Node-compatible packages.
7. **No telemetry, no accounts, no new network destinations by default.** The only outgoing request the app can make is the language-model call the user enabled.

## Consequences
- A leaked link is leaked forever; users are warned where they create it.
- Every summary request needs a running model server with CORS configured; the card explains the failure when it is not reachable.
- Companion-based integrations remain future work and need a maintainer who wants them.

# ADR-0003: Use @noble/ciphers and @noble/hashes for DS2 decryption

- Status: accepted
- Date: 2026-10-09

## Context
DS2 decoding needs AES-256-ECB (single use, derive common key), PBKDF2-HMAC-SHA256 (10 000 iterations) and AES-256-GCM. WebCrypto lacks ECB and is async-only.

## Decision
Use the audited, dependency-free `@noble/ciphers` and `@noble/hashes` (v2). They run identically in browsers, workers and Node tests.

## Consequences
- Synchronous API simplifies the loader and tests.
- Pure-JS PBKDF2 is slower than native; mitigated by caching derived keys (keys repeat across files).
- v2 import paths require the `.js` suffix.

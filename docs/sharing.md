# Sharing a snapshot

OpenCPAP has no server, so sharing cannot work like cloud services do ("upload, get a link"). Instead the **link itself is the data**: a snapshot of a report period is compressed, optionally encrypted, and placed in the URL *fragment* (the part after `#`). Browsers never send the fragment to a server, so nothing is uploaded or hosted by anyone.

Implementation: `apps/web/src/share.ts` (format), `features/share/SharePanel.tsx` (create, on the Report page), `features/share/ShareView.tsx` (open, route `#/shared/<payload>`). Tests: `share.test.ts`, `e2e/phase6.e2e.ts`.

## What a link contains
- The nightly figures of the chosen report period (`NightSummary` without sessions, settings and waveform flags): usage, event counts, AHI, leak, pressure, mode, breathing and oximetry statistics.
- The previous period, when "compare with the previous period" is on in the report.
- Setting changes inside the period.
- The device model, the period dates, the creation date, and **the name typed in the report's name field, if any**.

It never contains notes, tags, mood, equipment, the device serial number or waveforms. The viewer renders the same `ReportDocument` as the printable report, with notes and equipment forced off.

## Wire format
`base64url( flag ‖ body )`

| flag | body |
|---|---|
| `0` (plain) | `deflate(JSON)` |
| `1` (encrypted) | `salt(16) ‖ iv(12) ‖ AES-256-GCM( deflate(JSON) )`; key = PBKDF2-HMAC-SHA-256(passphrase NFKC, salt, 250 000 iterations) |

The JSON is a `Snapshot` (`v: 1`). Numbers are rounded to 4 decimals before compression. The GCM tag authenticates the ciphertext, so a modified link fails as "wrong passphrase or the link was changed". Salt and IV are random per link.

## Size
Measured on demo data (without breathing or oximetry statistics): a 30-night period is about 2 700 characters and 90 nights about 7 100. Real nights with breathing and oximetry figures are larger, so expect up to roughly twice that. The panel warns above 30 000 characters because some chat apps and mail clients truncate long URLs. There is no hard limit in the app (it accepts up to 400 000 characters).

## Threat model — read this before sending a link
| Situation | What happens |
|---|---|
| Plain link sent through a chat app | The app's servers see the full URL, **including the fragment**, if the app generates link previews or stores messages. Anyone with the link can read the figures. Treat a plain link like the report itself. |
| Encrypted link, passphrase sent through the *same* channel | No real protection from whoever can read that channel. |
| Encrypted link, passphrase sent separately | Protects against anyone who sees only the link. Strength depends on the passphrase: PBKDF2 slows guessing but a short passphrase can still be brute-forced offline, because the ciphertext is in the link. Use several random words. |
| Link posted publicly | Everyone can read it (plain) or attack the passphrase offline (encrypted). Do not. |
| Recipient's browser | Only decodes the link in the page; nothing is stored. The page loads the app from wherever OpenCPAP is hosted, so the host sees that the app was opened, but not the fragment. |
| Revoking | **Not possible.** A link cannot be recalled or expire; whoever has it keeps it. That is the cost of having no server. |

Because a link cannot be revoked, the viewer states that it is a read-only snapshot, with its creation date, and that it is not a diagnosis.

## Validation of incoming links
Links are untrusted input. The decoder rejects non-base64url text, payloads over 400 000 characters, inflated JSON over 4 MB, wrong versions, malformed dates, more than 2 000 nights and wrong shapes; free-text fields are truncated (name 80, device 200 characters); the viewer renders values as React text (never as HTML). Tests cover each case.

## Not implemented (needs infrastructure)
Revocable links, expiry, view counts and "share with a clinic account" would need a server. If one is ever added it must stay optional and end-to-end encrypted ([ADR-0012](decisions/0012-phase6-design-choices.md)).

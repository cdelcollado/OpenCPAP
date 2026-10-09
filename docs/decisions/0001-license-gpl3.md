# ADR-0001: License the project under GPL-3.0-or-later

- Status: accepted
- Date: 2026-10-09

## Context
The DreamStation 2 format is proprietary and undocumented. The only practical reference is OSCAR's PRS1 loader (GPLv3). A clean-room reimplementation from samples alone would be slow and error-prone.

## Decision
License OpenCPAP as GPL-3.0-or-later so that logic, constants and test knowledge from OSCAR can be adapted legitimately.

## Consequences
- Derivative works and distributed builds must remain GPL-compatible.
- Contributors license their work under the same terms.
- A permissive license would require a clean-room approach; rejected for cost.

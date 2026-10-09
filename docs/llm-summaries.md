# Written summaries with a language model (opt-in)

Optional and **off by default**. When enabled in *Settings → Written summary with a language model*, a Dashboard card can ask a model that the user runs to describe the last 30 days in a few sentences. The deterministic, rule-based nightly summary ([analytics.md](analytics.md)) is unaffected and always available.

Implementation: `apps/web/src/llm.ts`, `features/llm/LlmCard.tsx`, `features/llm/LlmSettings.tsx`. Tests: `llm.test.ts`, `e2e/phase6.e2e.ts`.

## How it works
1. The user enables the feature and gives the address of an **Ollama-compatible server** (default `http://localhost:11434`) and a model name (default `llama3.2`). Settings are kept in `localStorage` (`opencpap.llm`).
2. Pressing **Write a summary** builds a prompt (`buildPrompt`) and `POST`s `{ model, prompt, stream: false }` to `<address>/api/generate`. Nothing is ever sent automatically, on load or in the background.
3. The reply is shown as plain text (never HTML), capped at 4 000 characters, with a notice that it can be wrong and is not a diagnosis.

## What is sent
Only aggregates from `periodStats`: for the last 30 days and the 30 before — nights with data, mean hours, nights of at least 4 h, AHI, event rates by type, median 95th-percentile leak — plus the *keys and values* of therapy setting changes in the last period. The prompt contains **no dates of individual nights, no notes, tags, names, device serial or model**, and tells the model not to diagnose, not to recommend changing settings, medication or treatment, not to claim causes, and to suggest speaking to a clinician. Tests assert the absence of dates and serials.

## Where it may be sent
- **A local address** (`localhost`, `127.x.x.x`, `::1`) is used directly: no data leaves the computer.
- **Any other address** is treated as a remote server. The settings show a warning and the feature stays blocked until the user ticks "I understand and allow sending the figures to this server". Changing the address resets that consent. The check is on the parsed hostname, so `localhost.evil.com` or `127.0.0.1.evil.com` count as remote.
- The app never bundles a model or contacts a hosted AI service by itself.

## Making a local server reachable from the page
The browser enforces CORS. Ollama only answers pages from allowed origins; start it with the app's origin allowed, for example `OLLAMA_ORIGINS=http://localhost:5173 ollama serve` for development, or the origin where OpenCPAP is hosted. A page served over `https` may be blocked from calling `http://localhost` by some browsers' mixed-content rules (Chrome treats `localhost` as secure, so it works there). If the server cannot be reached the card says so and suggests checking these points.

## Limits and honesty
- Language models can produce wrong or misleading text. The card says so, and the prompt forbids advice, but this cannot be guaranteed; the output is **not reviewed** by the app.
- Quality varies with the model; small local models may answer poorly in Catalan.
- Only the Ollama request format is implemented. Other servers (OpenAI-compatible, llama.cpp) are future work.
- Streaming is off for simplicity; long answers appear all at once.

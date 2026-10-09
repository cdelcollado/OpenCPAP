import { addDays, nightsInRange, periodStats, type ChangeEvent, type NightSummary } from '@opencpap/core';

/**
 * Optional summary written by a language model that the user runs themselves (Ollama's HTTP API). Off by default.
 * The prompt contains aggregate figures only: no notes, no name, no serial number, no dates of individual nights.
 * See docs/llm-summaries.md.
 */

export interface LlmConfig {
  enabled: boolean;
  /** base URL of an Ollama-compatible server */
  endpoint: string;
  model: string;
  /** the user confirmed that data may leave this computer (only relevant for a non-local endpoint) */
  allowRemote: boolean;
}

export const DEFAULT_LLM: LlmConfig = { enabled: false, endpoint: 'http://localhost:11434', model: 'llama3.2', allowRemote: false };
const KEY = 'opencpap.llm';

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LlmConfig> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_LLM;
    return {
      enabled: raw.enabled === true,
      endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : DEFAULT_LLM.endpoint,
      model: typeof raw.model === 'string' ? raw.model : DEFAULT_LLM.model,
      allowRemote: raw.allowRemote === true,
    };
  } catch { return DEFAULT_LLM; }
}
export function saveLlmConfig(c: LlmConfig): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable: the choice lasts until reload */ }
}

/** True when the endpoint points at this computer, so no data leaves it. */
export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
  } catch { return false; }
}

/** Whether a request may be sent: enabled, a valid URL, and a remote server only after explicit consent. */
export function canSend(c: LlmConfig): boolean {
  if (!c.enabled || !c.model.trim()) return false;
  try { new URL(c.endpoint); } catch { return false; }
  return isLocalEndpoint(c.endpoint) || c.allowRemote;
}

const LANGUAGE_NAME: Record<string, string> = { en: 'English', ca: 'Catalan', es: 'Spanish' };

const r1 = (v: number | undefined, d = 1) => (v === undefined || Number.isNaN(v) ? 'n/a' : v.toFixed(d));

/** The text sent to the model. Everything in it is derived from `periodStats`, never from free text the user wrote. */
export function buildPrompt(nights: NightSummary[], asOf: string, changes: ChangeEvent[], lang: string, days = 30): string {
  const from = addDays(asOf, -(days - 1));
  const cur = periodStats(nightsInRange(nights, from, asOf));
  const prevTo = addDays(from, -1);
  const prev = periodStats(nightsInRange(nights, addDays(prevTo, -(days - 1)), prevTo));
  const rates = (s: ReturnType<typeof periodStats>) => Object.entries(s.rates).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${k} ${r1(v)}/h`).join(', ') || 'none';
  const changed = changes.filter((c) => c.date >= from && c.date <= asOf).flatMap((c) => c.changes.map((x) => `${x.key}: ${String(x.from)} -> ${String(x.to)}`));
  const line = (label: string, s: ReturnType<typeof periodStats>) =>
    `${label}: ${s.nights} nights with data; mean use ${r1(s.usageMean)} h; nights of at least 4 h ${s.nightsOverMin}/${s.nights}; AHI ${r1(s.ahi)} events/h; event rates (${rates(s)}); median 95th-percentile leak ${r1(s.leakP95)} L/min.`;
  return [
    'You summarise CPAP therapy statistics for the person who owns them. You are not a clinician.',
    'Write 4 to 6 short sentences in plain language. Describe what the numbers show and how the last period compares with the one before.',
    'Do NOT diagnose, do NOT recommend changing settings, medication or treatment, and do NOT claim a cause for any change. Suggest talking to their clinician for anything that worries them.',
    `Answer in ${LANGUAGE_NAME[lang.slice(0, 2)] ?? 'English'}.`,
    '',
    line(`Last ${days} days`, cur),
    line(`The ${days} days before`, prev),
    `Therapy setting changes in the last period: ${changed.length ? changed.join('; ') : 'none'}.`,
  ].join('\n');
}

export class LlmError extends Error {
  constructor(public kind: 'blocked' | 'unreachable' | 'http' | 'empty', message: string) { super(message); this.name = 'LlmError'; }
}

const MAX_REPLY_CHARS = 4000;

/** Calls Ollama's `/api/generate` (non-streaming). `fetchImpl` is injectable for tests. */
export async function requestSummary(c: LlmConfig, prompt: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<string> {
  if (!canSend(c)) throw new LlmError('blocked', 'The summary is disabled or the server is not allowed');
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${c.endpoint.replace(/\/+$/, '')}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: opts.signal,
      body: JSON.stringify({ model: c.model.trim(), prompt, stream: false }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new LlmError('unreachable', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new LlmError('http', `HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { response?: unknown } | null;
  const text = typeof body?.response === 'string' ? body.response.trim() : '';
  if (!text) throw new LlmError('empty', 'The model returned no text');
  return text.slice(0, MAX_REPLY_CHARS);
}

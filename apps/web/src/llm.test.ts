import { describe, expect, it } from 'vitest';
import { generateDemoSessions, groupNights, settingsChanges } from '@opencpap/core';
import { buildPrompt, canSend, DEFAULT_LLM, isLocalEndpoint, LlmError, requestSummary, type LlmConfig } from './llm';

const nights = groupNights(generateDemoSessions({ nights: 70, waveformNights: 0 }).map(({ waveforms: _w, ...s }) => s));
const asOf = nights.at(-1)!.date;
const on: LlmConfig = { ...DEFAULT_LLM, enabled: true };

describe('isLocalEndpoint', () => {
  it('accepts only this computer', () => {
    for (const u of ['http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434', 'https://localhost']) expect(isLocalEndpoint(u)).toBe(true);
    for (const u of ['http://192.168.1.5:11434', 'https://example.com', 'http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'ftp://localhost', 'nonsense', '']) expect(isLocalEndpoint(u)).toBe(false);
  });
});

describe('canSend', () => {
  it('is off by default and needs consent for remote servers', () => {
    expect(canSend(DEFAULT_LLM)).toBe(false);
    expect(canSend(on)).toBe(true);
    expect(canSend({ ...on, endpoint: 'https://llm.example.com' })).toBe(false);
    expect(canSend({ ...on, endpoint: 'https://llm.example.com', allowRemote: true })).toBe(true);
    expect(canSend({ ...on, model: ' ' })).toBe(false);
    expect(canSend({ ...on, endpoint: 'bad url' })).toBe(false);
  });
});

describe('buildPrompt', () => {
  const p = buildPrompt(nights, asOf, settingsChanges(nights), 'ca');
  it('carries aggregate figures and the safety instructions', () => {
    expect(p).toMatch(/Last 30 days: \d+ nights with data; mean use [\d.]+ h/);
    expect(p).toMatch(/The 30 days before:/);
    expect(p).toContain('Answer in Catalan');
    expect(p).toMatch(/do NOT diagnose/i);
    expect(p).toMatch(/do NOT recommend changing settings/i);
  });
  it('contains no dates of individual nights, serials or notes', () => {
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(p).not.toMatch(/serial/i);
  });
  it('falls back to English for unknown languages', () => expect(buildPrompt(nights, asOf, [], 'xx')).toContain('Answer in English'));
});

describe('requestSummary', () => {
  const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('posts to /api/generate without streaming and returns the trimmed reply', async () => {
    let seen: { url: string; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, body: JSON.parse(init.body as string) }; return new Response(JSON.stringify({ response: '  Hello.  ' })); }) as unknown as typeof fetch;
    expect(await requestSummary({ ...on, endpoint: 'http://localhost:11434/' }, 'PROMPT', { fetchImpl })).toBe('Hello.');
    expect(seen).toEqual({ url: 'http://localhost:11434/api/generate', body: { model: 'llama3.2', prompt: 'PROMPT', stream: false } });
  });
  it('never sends when blocked', async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    await expect(requestSummary(DEFAULT_LLM, 'x', { fetchImpl })).rejects.toMatchObject({ kind: 'blocked' });
    await expect(requestSummary({ ...on, endpoint: 'https://remote.example' }, 'x', { fetchImpl })).rejects.toMatchObject({ kind: 'blocked' });
    expect(called).toBe(false);
  });
  it('reports errors by kind and caps the reply', async () => {
    await expect(requestSummary(on, 'x', { fetchImpl: ok({}, 500) })).rejects.toMatchObject({ kind: 'http' });
    await expect(requestSummary(on, 'x', { fetchImpl: ok({ response: '  ' }) })).rejects.toMatchObject({ kind: 'empty' });
    await expect(requestSummary(on, 'x', { fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch })).rejects.toBeInstanceOf(LlmError);
    expect((await requestSummary(on, 'x', { fetchImpl: ok({ response: 'a'.repeat(9000) }) })).length).toBe(4000);
  });
});

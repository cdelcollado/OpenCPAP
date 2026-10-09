import { deflateSync, inflateSync } from 'fflate';
import type { ChangeEvent, NightSummary } from '@opencpap/core';
import type { ReportInput } from './features/report/ReportDocument';

/**
 * Serverless share links. A snapshot of a report period is compressed, optionally encrypted with a passphrase, and
 * stored in the URL *fragment* (`#/shared/<payload>`). Browsers never send the fragment to a server, so nothing is
 * uploaded and nothing is hosted: the link itself is the data. See docs/sharing.md for the threat model.
 *
 * Wire format (before base64url): `flag(1)` then either `deflate(json)` (flag 0) or
 * `salt(16) iv(12) AES-GCM(deflate(json))` (flag 1, key = PBKDF2-SHA256(passphrase, salt, 250 000 iterations)).
 */

export const SNAPSHOT_VERSION = 1;
export const PBKDF2_ITERATIONS = 250_000;
/** Longest payload accepted, in characters; keeps absurd links from being inflated. */
export const MAX_PAYLOAD_CHARS = 400_000;
const MAX_JSON_BYTES = 4_000_000;
const MAX_NIGHTS = 2000;
/** Links much longer than this are rejected by some chat apps and servers; the sender is warned. */
export const SAFE_LINK_CHARS = 30_000;

export type ShareErrorCode = 'bad-link' | 'passphrase-required' | 'wrong-passphrase' | 'unsupported-version';
export class ShareError extends Error {
  constructor(public code: ShareErrorCode) { super(code); this.name = 'ShareError'; }
}

type SharedNight = Omit<NightSummary, 'sessionIds' | 'start' | 'end' | 'hasWaveforms' | 'settings'>;

export interface Snapshot {
  v: typeof SNAPSHOT_VERSION;
  from: string;
  to: string;
  asOf: string;
  /** ISO date (YYYY-MM-DD) the link was made */
  created: string;
  device: string;
  /** only what the sender typed in the report's name field; empty when none */
  patient: string;
  totalDays: number;
  nights: SharedNight[];
  previous?: { from: string; to: string; nights: SharedNight[] };
  changes: ChangeEvent[];
}

const strip = (n: NightSummary): SharedNight => {
  const { sessionIds: _s, start: _a, end: _b, hasWaveforms: _w, settings: _t, ...rest } = n;
  return rest;
};

/** What a link carries: figures only. Notes, equipment and the serial number are never part of a snapshot. */
export function makeSnapshot(r: ReportInput, created = new Date().toISOString().slice(0, 10)): Snapshot {
  return {
    v: SNAPSHOT_VERSION, from: r.from, to: r.to, asOf: r.asOf, created, device: r.device, patient: r.patient, totalDays: r.totalDays,
    nights: r.nights.map(strip),
    previous: r.previous ? { from: r.previous.from, to: r.previous.to, nights: r.previous.nights.map(strip) } : undefined,
    changes: r.changes.filter((c) => c.date >= r.from && c.date <= r.to),
  };
}

const restore = (n: SharedNight): NightSummary => ({ ...n, sessionIds: [], start: 0, end: 0, hasWaveforms: false, settings: {} });

/** Rebuilds the report input for the viewer, with notes and equipment switched off. */
export function snapshotToReport(s: Snapshot, generated: string): ReportInput {
  return {
    from: s.from, to: s.to, asOf: s.asOf, totalDays: s.totalDays, device: s.device, patient: s.patient, generated,
    nights: s.nights.map(restore),
    previous: s.previous ? { from: s.previous.from, to: s.previous.to, nights: s.previous.nights.map(restore) } : undefined,
    changes: s.changes, equipment: [], journal: [],
    options: { includeNotes: false, includeNights: true, includeEquipment: false, includeCompare: !!s.previous },
  };
}

/* ---- encoding ---- */

const b64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new ShareError('bad-link');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Numbers are rounded to 4 decimals: invisible on screen, and it makes the JSON compress much better. */
const round = (_k: string, v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);

async function key(pass: string, salt: Uint8Array, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export async function encodeSnapshot(s: Snapshot, passphrase = ''): Promise<string> {
  const packed = deflateSync(new TextEncoder().encode(JSON.stringify(s, round)), { level: 9 });
  if (!passphrase) return b64(Uint8Array.from([0, ...packed]));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await key(passphrase, salt, ['encrypt']), packed as BufferSource));
  const out = new Uint8Array(1 + 16 + 12 + sealed.length);
  out[0] = 1; out.set(salt, 1); out.set(iv, 17); out.set(sealed, 29);
  return b64(out);
}

export function isEncrypted(payload: string): boolean {
  try { return unb64(payload.slice(0, 4).padEnd(4, 'A'))[0] === 1; } catch { return false; }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isNight = (n: unknown): n is SharedNight => {
  const o = n as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && typeof o.date === 'string' && DATE.test(o.date) && typeof o.usageHours === 'number' && typeof o.counts === 'object' && o.counts !== null;
};

/** Checks the shape of decoded JSON so a hand-made or damaged link cannot crash the viewer. */
export function validateSnapshot(x: unknown): Snapshot {
  const o = x as Partial<Snapshot> | null;
  if (!o || typeof o !== 'object') throw new ShareError('bad-link');
  if (o.v !== SNAPSHOT_VERSION) throw new ShareError('unsupported-version');
  const str = (v: unknown) => typeof v === 'string';
  if (![o.from, o.to, o.asOf, o.created].every((d) => str(d) && DATE.test(d as string))) throw new ShareError('bad-link');
  if (!Array.isArray(o.nights) || o.nights.length > MAX_NIGHTS || !o.nights.every(isNight)) throw new ShareError('bad-link');
  if (o.previous && (!Array.isArray(o.previous.nights) || o.previous.nights.length > MAX_NIGHTS || !o.previous.nights.every(isNight) || !DATE.test(o.previous.from) || !DATE.test(o.previous.to))) throw new ShareError('bad-link');
  if (!Array.isArray(o.changes) || !o.changes.every((c) => c && typeof c.date === 'string' && DATE.test(c.date) && Array.isArray(c.changes))) throw new ShareError('bad-link');
  return {
    v: SNAPSHOT_VERSION, from: o.from!, to: o.to!, asOf: o.asOf!, created: o.created!,
    device: str(o.device) ? o.device!.slice(0, 200) : '', patient: str(o.patient) ? o.patient!.slice(0, 80) : '',
    totalDays: typeof o.totalDays === 'number' ? o.totalDays : o.nights.length,
    nights: o.nights, previous: o.previous, changes: o.changes,
  };
}

export async function decodeSnapshot(payload: string, passphrase = ''): Promise<Snapshot> {
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_CHARS) throw new ShareError('bad-link');
  const raw = unb64(payload);
  let packed: Uint8Array;
  if (raw[0] === 0) packed = raw.subarray(1);
  else if (raw[0] === 1) {
    if (!passphrase) throw new ShareError('passphrase-required');
    if (raw.length < 29 + 16) throw new ShareError('bad-link');
    try {
      packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(17, 29) as BufferSource }, await key(passphrase, raw.slice(1, 17), ['decrypt']), raw.slice(29) as BufferSource));
    } catch { throw new ShareError('wrong-passphrase'); }
  } else throw new ShareError('bad-link');
  let json: Uint8Array;
  try { json = inflateSync(packed); } catch { throw new ShareError('bad-link'); }
  if (json.length > MAX_JSON_BYTES) throw new ShareError('bad-link');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(json)); } catch { throw new ShareError('bad-link'); }
  return validateSnapshot(parsed);
}

/** Full link for a payload, relative to the page the app is served from. */
export const shareUrl = (payload: string, base = `${window.location.origin}${window.location.pathname}`) => `${base}#/shared/${payload}`;

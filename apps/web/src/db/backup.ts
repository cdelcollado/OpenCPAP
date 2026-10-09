import type { OpenCpapDb, EquipmentRow, JournalRow, OximetryRow, OximetrySamplesRow, SessionRow, WaveformRow } from './db';

/**
 * Backup file: gzip-compressed NDJSON (one JSON object per line), so large histories are written and read as a
 * stream and never need one giant string. Line 1 is the header; the rest are `{ "t": kind, "row": … }` records.
 * Typed arrays are stored as `{ "$ta": "Float32Array", "b64": "…" }`.
 */
export const BACKUP_FORMAT = 'opencpap-backup';
export const BACKUP_VERSION = 1;
/** Upper bound for the *decompressed* size of a backup we are willing to read (defuses decompression bombs). */
export const MAX_BACKUP_BYTES = 1.5 * 1024 ** 3;

export interface BackupHeader { format: typeof BACKUP_FORMAT; version: number; createdAt: string; app: string; includesWaveforms: boolean }
export interface BackupCounts { sessions: number; waveforms: number; journal: number; equipment: number; oximetry: number; skipped: number }

/* ---------- typed-array (de)serialisation ---------- */

const CHUNK = 0x8000;
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ARRAYS = { Float32Array, Float64Array } as const;

export function stringifyRecord(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Float32Array || v instanceof Float64Array) {
      return { $ta: v.constructor.name, b64: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    }
    return v;
  });
}

export function parseRecord(line: string): unknown {
  return JSON.parse(line, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.$ta === 'string' && typeof v.b64 === 'string') {
      const Ctor = (ARRAYS as Record<string, typeof Float32Array | typeof Float64Array>)[v.$ta];
      if (!Ctor) throw new Error(`unsupported typed array ${String(v.$ta)}`);
      const bytes = fromBase64(v.b64);
      if (bytes.length % Ctor.BYTES_PER_ELEMENT !== 0) throw new Error('truncated typed array');
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer);
    }
    return v;
  });
}

/* ---------- validation of untrusted rows ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isTyped = (v: unknown) => v instanceof Float32Array || v instanceof Float64Array;

export function validSession(r: unknown): r is SessionRow {
  if (!isObj(r) || typeof r.key !== 'string' || typeof r.deviceId !== 'string' || !isDate(r.night) || !isNum(r.start) || !isObj(r.session)) return false;
  const s = r.session;
  return isNum(s.id) && isNum(s.start) && isNum(s.end) && Array.isArray(s.slices) && Array.isArray(s.events) && Array.isArray(s.statistics) && isObj(s.settings) && isObj(s.device)
    && (s.statistics as unknown[]).every((t) => isObj(t) && isTyped(t.times) && isTyped(t.values));
}
export const validWaveform = (r: unknown): r is WaveformRow => isObj(r) && typeof r.key === 'string' && typeof r.sessionKey === 'string' && isObj(r.waveform) && isTyped(r.waveform.samples) && isNum(r.waveform.sampleRate);
export const validJournal = (r: unknown): r is JournalRow => isObj(r) && isDate(r.date) && typeof r.note === 'string' && Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string') && isNum(r.updatedAt);
export const validOximetry = (r: unknown): r is OximetryRow => isObj(r) && isDate(r.date) && typeof r.source === 'string' && isNum(r.start) && isNum(r.end) && isObj(r.stats) && isNum(r.importedAt);
export const validOximetrySamples = (r: unknown): r is OximetrySamplesRow => isObj(r) && isDate(r.date) && isTyped(r.times) && isTyped(r.spo2) && isTyped(r.pulse) && (r.times as Float64Array).length === (r.spo2 as Float32Array).length && (r.times as Float64Array).length === (r.pulse as Float32Array).length;
export const validEquipment = (r: unknown): r is EquipmentRow => isObj(r) && typeof r.id === 'string' && typeof r.kind === 'string' && typeof r.name === 'string' && isDate(r.startDate) && isNum(r.intervalDays) && isNum(r.updatedAt);

/* ---------- export ---------- */

export interface ExportOptions { includeWaveforms: boolean; app: string }

/** Builds the (gzip-compressed when supported) backup as a Blob. */
export async function exportBackup(db: OpenCpapDb, opts: ExportOptions): Promise<Blob> {
  const parts: string[] = [];
  const header: BackupHeader = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), app: opts.app, includesWaveforms: opts.includeWaveforms };
  parts.push(`${JSON.stringify(header)}\n`);
  await db.sessions.each((row) => { parts.push(`${stringifyRecord({ t: 'session', row })}\n`); });
  if (opts.includeWaveforms) await db.waveforms.each((row) => { parts.push(`${stringifyRecord({ t: 'waveform', row })}\n`); });
  await db.journal.each((row) => { parts.push(`${stringifyRecord({ t: 'journal', row })}\n`); });
  await db.equipment.each((row) => { parts.push(`${stringifyRecord({ t: 'equipment', row })}\n`); });
  await db.oximetry.each((row) => { parts.push(`${stringifyRecord({ t: 'oximetry', row })}\n`); });
  await db.oximetrySamples.each((row) => { parts.push(`${stringifyRecord({ t: 'oximetrySamples', row })}\n`); });
  const plain = new Blob(parts, { type: 'application/x-ndjson' });
  if (typeof CompressionStream === 'undefined') return plain;
  return new Response(plain.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

/* ---------- import ---------- */

export class BackupError extends Error {}

async function* lines(blob: Blob): AsyncGenerator<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  if (gz && typeof DecompressionStream === 'undefined') throw new BackupError('This browser cannot read compressed backups');
  const stream = gz ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      total += value.length;
      if (total > MAX_BACKUP_BYTES) throw new BackupError('The backup is too large');
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) yield l; }
    }
    if (done) break;
  }
  if (buf.trim()) yield buf;
}

/**
 * Restores a backup into the database. Sessions and waveforms replace rows with the same key; journal and equipment
 * rows are replaced only when the backup's copy is newer. Malformed lines are skipped and counted, never trusted.
 */
export async function importBackup(db: OpenCpapDb, blob: Blob): Promise<BackupCounts> {
  const counts: BackupCounts = { sessions: 0, waveforms: 0, journal: 0, equipment: 0, oximetry: 0, skipped: 0 };
  let first = true;
  const acceptedOximetry = new Set<string>(); // nights whose metadata came from this backup: only those take its samples
  let batch: { sessions: SessionRow[]; waveforms: WaveformRow[] } = { sessions: [], waveforms: [] };
  const flush = async () => {
    if (batch.sessions.length) await db.sessions.bulkPut(batch.sessions);
    if (batch.waveforms.length) await db.waveforms.bulkPut(batch.waveforms);
    batch = { sessions: [], waveforms: [] };
  };
  for await (const line of lines(blob)) {
    let rec: unknown;
    try { rec = parseRecord(line); } catch { if (first) throw new BackupError('Not an OpenCPAP backup'); counts.skipped++; continue; }
    if (first) {
      first = false;
      const h = rec as Partial<BackupHeader>;
      if (!isObj(rec) || h.format !== BACKUP_FORMAT) throw new BackupError('Not an OpenCPAP backup');
      if (typeof h.version !== 'number' || h.version > BACKUP_VERSION) throw new BackupError('This backup was made by a newer version of OpenCPAP');
      continue;
    }
    if (!isObj(rec) || typeof rec.t !== 'string') { counts.skipped++; continue; }
    const row = rec.row;
    if (rec.t === 'session' && validSession(row)) { batch.sessions.push(row); counts.sessions++; }
    else if (rec.t === 'waveform' && validWaveform(row)) { batch.waveforms.push(row); counts.waveforms++; }
    else if (rec.t === 'journal' && validJournal(row)) {
      const cur = await db.journal.get(row.date);
      if (!cur || cur.updatedAt < row.updatedAt) await db.journal.put(row);
      counts.journal++;
    } else if (rec.t === 'equipment' && validEquipment(row)) {
      const cur = await db.equipment.get(row.id);
      if (!cur || cur.updatedAt < row.updatedAt) await db.equipment.put(row);
      counts.equipment++;
    } else if (rec.t === 'oximetry' && validOximetry(row)) {
      const cur = await db.oximetry.get(row.date);
      if (!cur || cur.importedAt < row.importedAt) { await db.oximetry.put(row); acceptedOximetry.add(row.date); }
      counts.oximetry++;
    } else if (rec.t === 'oximetrySamples' && validOximetrySamples(row)) {
      if (acceptedOximetry.has(row.date)) await db.oximetrySamples.put(row); // samples only go with their own metadata
    } else counts.skipped++;
    if (batch.sessions.length + batch.waveforms.length >= 100) await flush();
  }
  if (first) throw new BackupError('The file is empty');
  await flush();
  return counts;
}

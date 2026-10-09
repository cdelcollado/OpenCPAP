import type { Chunk } from './chunk';
import type { EventType } from '@opencpap/core';

/**
 * Event records (`.B02`), family 0 / version 6.
 * Adapted from OSCAR's PRS1DataChunk::ParseEventsF0V6 (GPLv3). Specification: docs/formats/ds2.md.
 */

export interface ParsedEvent {
  type: EventType;
  /** seconds since the chunk timestamp (may be negative for events reported after they ended) */
  start: number;
  duration: number;
  /** raw record code, kept for diagnostics (several codes map to the same event type) */
  code: number;
}

export interface ParsedStat {
  channel: 'pressure-set' | 'epap-set' | 'ipap-set' | 'pressure-avg' | 'flex-pressure-avg' | 'leak-total' | 'snore-count';
  /** seconds since the chunk timestamp */
  t: number;
  value: number;
}

export interface EventsResult {
  events: ParsedEvent[];
  stats: ParsedStat[];
  duration: number;
  unknownRecords: number;
}

const u16 = (d: Uint8Array, p: number) => d[p]! | (d[p + 1]! << 8);

export function parseEvents(chunk: Chunk): EventsResult {
  if (chunk.family !== 0 || chunk.familyVersion !== 6) {
    throw new Error(`events: unsupported family ${chunk.family} version ${chunk.familyVersion}`);
  }
  const d = chunk.data;
  const res: EventsResult = { events: [], stats: [], duration: 0, unknownRecords: 0 };
  let pos = 0;
  let t = 0;
  while (pos < d.length) {
    const code = d[pos++]!;
    const size = chunk.hblock.get(code);
    if (size === undefined || pos + size > d.length) break;
    const next = pos + size;
    let p = pos;
    if (code !== 0x12) { // snore-per-pressure record has no timestamp
      if (size < 2) break;
      t += u16(d, p);
      p += 2;
    }
    const left = next - p; // data bytes available after the timestamp
    const byte = (i: number) => (i < left ? d[p + i]! : 0);
    const flag = (type: EventType, elapsed: number) => res.events.push({ type, start: t - elapsed, duration: 0, code });
    const span = (type: EventType) => {
      const duration = 2 * (byte(0) | (byte(1) << 8));
      const elapsed = byte(2);
      res.events.push({ type, start: t - elapsed - duration, duration, code });
    };
    switch (code) {
      case 0x01: res.stats.push({ channel: 'pressure-set', t, value: byte(0) / 10 }); break;
      case 0x02:
        res.stats.push({ channel: 'ipap-set', t, value: byte(1) / 10 });
        res.stats.push({ channel: 'epap-set', t, value: byte(0) / 10 });
        break;
      case 0x03: case 0x04: break; // auto-CPAP starting pressure / pressure pulse: not interpreted yet
      case 0x05: flag('rera', byte(0)); break;
      case 0x06: flag('obstructive', byte(0)); break;
      case 0x07: flag('central', byte(0)); break;
      case 0x0b: flag('hypopnea', byte(1)); break;
      case 0x0a: case 0x14: case 0x15: flag('hypopnea', byte(0)); break;
      case 0x0c: flag('flow-limitation', byte(0)); break;
      case 0x0d: res.events.push({ type: 'vibratory-snore', start: t, duration: 0, code }); break;
      case 0x0e: span('variable-breathing'); break;
      case 0x0f: span('periodic-breathing'); break;
      case 0x10: span('large-leak'); break;
      case 0x11:
        res.stats.push({ channel: 'leak-total', t, value: byte(0) });
        res.stats.push({ channel: 'snore-count', t, value: byte(1) });
        // Bi-level reports the average of EPAP/IPAP; single-pressure modes report the Flex-adjusted average.
        res.stats.push({ channel: res.stats.some((s) => s.channel === 'ipap-set') ? 'pressure-avg' : 'flex-pressure-avg', t, value: byte(2) / 10 });
        break;
      case 0x12: break; // snore count per pressure: not interpreted yet
      default:
        res.unknownRecords++;
    }
    pos = next;
  }
  // zero-length spans carry no information (OSCAR drops them too)
  res.events = res.events.filter((e) => !(e.duration === 0 && (e.type === 'periodic-breathing' || e.type === 'large-leak' || e.type === 'variable-breathing')));
  res.duration = t;
  return res;
}

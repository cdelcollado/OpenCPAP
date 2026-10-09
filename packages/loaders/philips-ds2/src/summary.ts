import type { Chunk } from './chunk';
import type { SessionSettings } from '@opencpap/core';

/**
 * Summary records (`.B01`), family 0 / version 6 (DreamStation 2, DreamStation 400X/500X…).
 * Adapted from OSCAR's PRS1DataChunk::ParseSummaryF0V6 and ParseSettingsF0V6 (GPLv3).
 * Specification: docs/formats/ds2.md.
 */

export type SliceKind = 'mask-on' | 'mask-off' | 'equipment-off';

export interface SliceMark {
  /** seconds since the chunk timestamp */
  t: number;
  kind: SliceKind;
}

export interface SummaryResult {
  slices: SliceMark[];
  settings: SessionSettings;
  /** total seconds covered by the chunk */
  duration: number;
  /**
   * Event counts reported by the device itself (record 8), used to cross-check our own event parsing.
   * Words 1 (OA), 3 (CA), 8 (H), 10 (RERA) and 11 (FL) are verified against parsed events; word 2 is unknown.
   */
  deviceCounts?: { obstructive: number; central: number; hypopnea: number; rera: number; flowLimitation: number; words: number[][] };
  /** records that were skipped because their meaning is unknown */
  unknownRecords: number;
}

const u16 = (d: Uint8Array, p: number) => d[p]! | (d[p + 1]! << 8);

const MODES = ['cpap', 'bilevel', 'auto-cpap', 'auto-bilevel', 'cpap-check'] as const;

/** Humidifier byte pair (shared by all fileVersion 3 devices). */
function parseHumidifier(b1: number, b2: number, out: SessionSettings) {
  const humid = b1 >> 5;
  const level = (b1 >> 2) & 7;
  const tubeTemp = (b2 >> 5) & 7;
  const present = humid !== 4;
  out.humidifierPresent = present;
  if (!present) return;
  const modes = ['fixed', 'adaptive', 'heated-tube', 'passover', undefined, 'error'] as const;
  const mode = modes[humid];
  if (mode) out.humidifierMode = mode;
  out.humidifierLevel = level;
  if (humid === 2) out.heatedTubeTemperature = tubeTemp;
}

const TUBING_MM = [22, 15, 15, 12, 12];

/** The settings slice is a nested list of (code, length, value…) triples. */
function parseSettings(d: Uint8Array, start: number, size: number, out: SessionSettings): boolean {
  const end = start + size;
  let pos = start;
  let mode: (typeof MODES)[number] | undefined;
  let flex: string | undefined;
  while (pos + 2 <= end) {
    const code = d[pos]!;
    const len = d[pos + 1]!;
    pos += 2;
    if (len < 1 || pos + len > end) return false;
    const v = d[pos]!;
    const need = (n: number) => len >= n;
    switch (code) {
      case 0x00:
        mode = MODES[v];
        if (mode) out.mode = mode;
        break;
      case 0x0a: out.pressure = v / 10; break;
      case 0x0c:
        if (need(3)) { out.pressureMin = v / 10; out.pressureMax = d[pos + 1]! / 10; out.pressure = d[pos + 2]! / 10; }
        break;
      case 0x0d:
        if (need(2)) { out.pressureMin = v / 10; out.pressureMax = d[pos + 1]! / 10; }
        break;
      case 0x0e:
        if (need(2)) { out.epap = v / 10; out.ipap = d[pos + 1]! / 10; out.pressureSupport = (d[pos + 1]! - v) / 10; }
        break;
      case 0x0f:
        if (need(4)) {
          out.epapMin = v / 10; out.ipapMax = d[pos + 1]! / 10;
          out.pressureSupportMin = d[pos + 2]! / 10; out.pressureSupportMax = d[pos + 3]! / 10;
        }
        break;
      case 0x10:
        if (need(3)) { out.autoTrialDays = v; out.pressureMin = d[pos + 1]! / 10; out.pressureMax = d[pos + 2]! / 10; }
        break;
      case 0x2a: case 0x42: out.ezStart = v !== 0; break;
      case 0x2b: out.rampType = v !== 0 ? 'smart-ramp' : 'linear'; break;
      case 0x2c:
        out.rampTimeMinutes = v;
        if (out.rampType === undefined) out.rampType = 'ramp-plus';
        break;
      case 0x2d: out.rampPressure = v / 10; break;
      case 0x2e:
        flex = ({ 0: 'none', 0x80: 'flex', 0x90: 'flex-plus', 0xa0: 'rise-time', 0xb0: 'p-flex' } as Record<number, string>)[v];
        if (flex) out.flexMode = flex;
        break;
      case 0x30: out.flexLevel = v; break;
      case 0x35: if (need(2)) parseHumidifier(v, d[pos + 1]!, out); break;
      case 0x38: out.maskResistance = v; break;
      case 0x3b: case 0x40: case 0x46: {
        const mm = TUBING_MM[v];
        if (mm !== undefined) out.tubingDiameterMm = mm;
        break;
      }
      case 0x3c: case 0x4b: out.showAhiOnDevice = v !== 0; break;
      case 0x3e: out.autoOn = v !== 0; break;
      case 0x3f: out.autoOff = v !== 0; break;
      case 0x4a: out.patientControlsAccess = v !== 0; break;
      default:
        break; // lock flags and not-yet-understood settings are ignored (see docs)
    }
    pos += len;
  }
  return true;
}

export function parseSummary(chunk: Chunk): SummaryResult {
  if (chunk.family !== 0 || chunk.familyVersion !== 6) {
    throw new Error(`summary: unsupported family ${chunk.family} version ${chunk.familyVersion}`);
  }
  const d = chunk.data;
  const res: SummaryResult = { slices: [], settings: {}, duration: 0, unknownRecords: 0 };
  let pos = 0;
  let tt = 0;
  while (pos < d.length) {
    const code = d[pos++]!;
    const size = chunk.hblock.get(code);
    if (size === undefined || pos + size > d.length) break; // malformed: keep what we have
    switch (code) {
      case 0x01:
        if (!parseSettings(d, pos, size, res.settings)) res.unknownRecords++;
        break;
      case 0x02: case 0x03: case 0x04:
        if (size < 2) break;
        tt += u16(d, pos);
        res.slices.push({ t: tt, kind: code === 0x03 ? 'mask-on' : code === 0x04 ? 'mask-off' : 'equipment-off' });
        break;
      case 0x09: case 0x0a: case 0x0b:
        if (size >= 2) tt += u16(d, pos); // elapsed time without a state change
        break;
      case 0x08: // one statistics record per mask-on period
        if (size >= 0x18) {
          const c = (res.deviceCounts ??= { obstructive: 0, central: 0, hypopnea: 0, rera: 0, flowLimitation: 0, words: [] });
          c.obstructive += u16(d, pos + 2);
          c.central += u16(d, pos + 6);
          c.hypopnea += u16(d, pos + 16);
          c.rera += u16(d, pos + 20);
          c.flowLimitation += u16(d, pos + 22);
          c.words.push(Array.from({ length: Math.min(size >> 1, 16) }, (_, i) => u16(d, pos + 2 * i)));
        }
        break;
      case 0x00: case 0x05: case 0x06: case 0x07: case 0x0c: case 0x0d: case 0x0e:
        break; // equipment-on marker, pressure/stat records: not interpreted yet
      default:
        res.unknownRecords++;
    }
    pos += size;
  }
  res.duration = tt;
  return res;
}

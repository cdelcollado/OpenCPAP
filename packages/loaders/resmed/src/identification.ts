import type { DeviceInfo } from '@opencpap/core';

/**
 * Device identity from `Identification.tgt` (AirSense 10 / AirCurve 10 / S9: lines such as `#SRN 22xxxxxxxx`) or
 * `Identification.json` (AirSense 11). Field names follow OSCAR's resmed_loader.cpp; the AirSense 11 layout is
 * *unverified* (no card was available), so the JSON reader searches for known key names instead of fixed paths.
 */
export interface Identification {
  serial: string;
  /** product name as the device writes it, underscores replaced by spaces */
  product?: string;
  /** numeric product code (`#PCD`) */
  productCode?: string;
  firmware?: string;
}

/** Parses the `#KEY value` lines of `Identification.tgt`. */
export function parseTgt(text: string): Identification | undefined {
  const kv = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^#([A-Z]{3})\s+(.*\S)\s*$/.exec(line);
    if (m) kv.set(m[1]!, m[2]!);
  }
  const serial = kv.get('SRN');
  if (!serial) return undefined;
  return { serial, product: kv.get('PNA')?.replace(/_/g, ' '), productCode: kv.get('PCD'), firmware: kv.get('PVR') };
}

/** Finds the first string/number value stored under any of `keys`, at any depth. */
function findKey(node: unknown, keys: readonly string[]): string | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  for (const [k, v] of Object.entries(node)) {
    if (keys.includes(k) && (typeof v === 'string' || typeof v === 'number')) return String(v);
  }
  for (const v of Object.values(node)) {
    const found = findKey(v, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Best-effort reader for `Identification.json` (unverified layout). */
export function parseIdentificationJson(text: string): Identification | undefined {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return undefined; }
  const serial = findKey(data, ['SerialNumber', 'SRN']);
  if (!serial) return undefined;
  return {
    serial,
    product: findKey(data, ['ProductName', 'PNA'])?.replace(/_/g, ' '),
    productCode: findKey(data, ['ProductCode', 'PCD']),
    firmware: findKey(data, ['SoftwareVersion', 'PVR']),
  };
}

export function deviceInfo(id: Identification | undefined): DeviceInfo {
  return {
    manufacturer: 'ResMed',
    model: id?.product ?? (id?.productCode ? `ResMed device (${id.productCode})` : 'ResMed device'),
    serial: id?.serial ?? '',
    firmware: id?.firmware,
  };
}

import { ecb, gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Encrypted DreamStation 2 container (used by *.BIN and *.B0x files).
 * Format and constants adapted from OSCAR's PRS1 loader (GPLv3): prs1_loader.cpp, class PRDS2File.
 * The key material is public, so this is obfuscation that lets patients read their own data.
 * Full specification: docs/formats/ds2.md
 */

const HEADER_SIZE = 0xca;
const OSCAR_KEY = new TextEncoder().encode('Patient access to their own data'); // 32 bytes
const COMMON_KEY = Uint8Array.from([
  0x75, 0xb3, 0xa2, 0x12, 0x4a, 0x65, 0xaf, 0x97, 0x54, 0xd8, 0xc1, 0xf3, 0xe5, 0x2e, 0xb6, 0xf0,
  0x23, 0x20, 0x57, 0x69, 0x7e, 0x38, 0x0e, 0xc9, 0x4a, 0xdc, 0x46, 0x45, 0xb6, 0x92, 0x5a, 0x98,
]);

export interface Ds2Header {
  guid: string;
  iv: Uint8Array;
  salt: Uint8Array;
  exportKey: Uint8Array;
  exportKeyTag: Uint8Array;
  payloadTag: Uint8Array;
}

class Reader {
  pos = 0;
  constructor(private b: Uint8Array) {}
  u16() {
    if (this.pos + 2 > this.b.length) throw new Error('DS2: truncated header');
    const v = this.b[this.pos]! | (this.b[this.pos + 1]! << 8);
    this.pos += 2;
    return v;
  }
  bytes() {
    const n = this.u16();
    if (this.pos + n > this.b.length) throw new Error('DS2: truncated header');
    const r = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return r;
  }
}

export function parseDs2Header(data: Uint8Array): Ds2Header {
  const r = new Reader(data);
  if (r.u16() !== 0x0d || r.u16() !== 1 || r.u16() !== 1) throw new Error('DS2: not a DS2 container');
  const guid = new TextDecoder().decode(r.bytes());
  const iv = r.bytes();
  const salt = r.bytes();
  if (iv.length !== 12 || salt.length !== 16) throw new Error('DS2: unexpected IV/salt size');
  r.u16(); r.u16(); // 0, 1
  r.bytes(); r.bytes(); // import key + tag (device-specific key; unused)
  const exportKey = r.bytes();
  const exportKeyTag = r.bytes();
  const payloadTag = r.bytes();
  if (r.pos !== HEADER_SIZE) throw new Error(`DS2: header size ${r.pos} != ${HEADER_SIZE}`);
  return { guid, iv, salt, exportKey, exportKeyTag, payloadTag };
}

const concat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};

let commonKey: Uint8Array | undefined;
const keyCache = new Map<string, Uint8Array>(); // derivation is slow (PBKDF2, 10000 iterations); keys repeat across files

function payloadKey(h: Ds2Header): Uint8Array {
  const id = Array.from(concat(h.iv, h.salt, h.exportKey, h.exportKeyTag), (x) => x.toString(16).padStart(2, '0')).join('');
  const hit = keyCache.get(id);
  if (hit) return hit;
  commonKey ??= ecb(OSCAR_KEY, { disablePadding: true }).decrypt(COMMON_KEY);
  const salted = pbkdf2(sha256, commonKey, h.salt, { c: 10000, dkLen: 32 });
  const key = gcm(salted, h.iv).decrypt(concat(h.exportKey, h.exportKeyTag));
  keyCache.set(id, key);
  return key;
}

/** Decrypts a DS2 file and returns its plaintext. Throws if the key or a GCM tag fails to validate. */
export function decryptDs2(data: Uint8Array): { header: Ds2Header; payload: Uint8Array } {
  const header = parseDs2Header(data);
  const key = payloadKey(header);
  const ciphertext = data.subarray(HEADER_SIZE);
  const payload = gcm(key, header.iv).decrypt(concat(ciphertext, header.payloadTag));
  return { header, payload };
}

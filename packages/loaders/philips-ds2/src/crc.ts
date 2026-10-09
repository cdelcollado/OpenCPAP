/**
 * CRC routines used by PRS1 chunks (adapted from OSCAR's prs1_parser.cpp, GPLv3).
 * Tables are generated at load time instead of being pasted as literals.
 */

const CRC16_TABLE = (() => {
  // CRC-16/KERMIT: reflected polynomial 0x8408
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1;
    t[i] = c;
  }
  return t;
})();

const CRC32_TABLE = (() => {
  // CRC-32/MPEG-2: MSB-first, polynomial 0x04C11DB7
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc16(data: Uint8Array, crc = 0): number {
  for (let i = 0; i < data.length; i++) crc = CRC16_TABLE[(data[i]! ^ crc) & 0xff]! ^ (crc >>> 8);
  return crc & 0xffff;
}

function crc32Bytes(data: Uint8Array, crc: number): number {
  for (let i = 0; i < data.length; i++) crc = (CRC32_TABLE[(data[i]! ^ (crc >>> 24)) & 0xff]! ^ (crc << 8)) >>> 0;
  return crc;
}

/**
 * PRS1's CRC32 treats every payload byte as a 32-bit word `00 00 00 bb`
 * (the device uses an STM32 CRC unit that works on whole words).
 */
export function crc32Wchar(data: Uint8Array, crc = 0xffffffff): number {
  const word = new Uint8Array(4);
  for (let i = 0; i < data.length; i++) {
    word[3] = data[i]!;
    crc = crc32Bytes(word, crc);
  }
  return crc >>> 0;
}

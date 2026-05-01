/**
 * The compile-side u16 wire domain: encode number[] → X85(GVE16(u16[])),
 * throwing on anything the 16-bit wire can't carry. The S1 16-bit ceiling
 * question (GVE32 vs chunked pools) is decided in S1-M4 with measurements
 * from this check.
 */
import { encodeGVE16, encodeX85 } from '@cldr/internal-core';
import type { PoolCodec, PoolPack } from '../pack/types.js';

/** The wire domain ceiling: every encoded number must fit u16. */
export const U16_CEILING = 65535;

/** Throw unless every value is an integer in the u16 wire domain. */
export const toU16 = (numbers: readonly number[]): Uint16Array => {
  const out = new Uint16Array(numbers.length);
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (!Number.isInteger(n) || n < 0 || n > U16_CEILING) {
      throw new RangeError(`value ${n} is outside the u16 wire domain [0, ${U16_CEILING}]`);
    }
    out[i] = n;
  }
  return out;
};

/** number[] → X85(GVE16(u16[])). */
export const packU16 = (numbers: readonly number[]): string => encodeX85(encodeGVE16(toU16(numbers)));

const encoder = new TextEncoder();

/**
 * Compile a string pool. Pool strings are assembled and indexed by the
 * caller (compile/locale.ts assigns indices before tries can reference them);
 * offsets are u16 byte/code-unit positions, so data length is implicitly
 * capped at 65535 — exceeding it throws here, surfacing the ceiling question
 * with a real measurement.
 */
export const encodePool = (strings: readonly string[], codec: PoolCodec): PoolPack => {
  if (codec === 'utf16') {
    const data: number[] = [];
    const offsets: number[] = [];
    for (const s of strings) {
      offsets.push(data.length);
      for (let i = 0; i < s.length; i++) {
        data.push(s.charCodeAt(i));
      }
    }
    offsets.push(data.length);
    return { codec, offsets: packU16(offsets), data: packU16(data) };
  }

  const parts = strings.map((s) => encoder.encode(s));
  const data = new Uint8Array(parts.reduce((acc, p) => acc + p.length, 0));
  const offsets: number[] = [];
  let pos = 0;
  for (const p of parts) {
    offsets.push(pos);
    data.set(p, pos);
    pos += p.length;
  }
  offsets.push(pos);
  return { codec, offsets: packU16(offsets), data: encodeX85(data) };
};

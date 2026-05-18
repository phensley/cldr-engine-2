/**
 * The compile-side u16 wire domain: number[] → X85(GVE16(u16[])),
 * throwing on anything the 16-bit wire can't carry. v0.1: this covers
 * the numeric streams only (tries, currency tables, numeric tables) —
 * string pools are array literals and have no u16 domain.
 */
import { encodeGVE16, encodeX85 } from '@cldr/internal-core';

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

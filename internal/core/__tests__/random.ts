/**
 * Deterministic random test-fixture helpers.
 *
 * RECONSTRUCTED: the original `random.ts` was missing from the source repo
 * (cldr-engine-ng) — several tests imported `randgen`, `randomNumbers`, and
 * `randomStrings` from it, but the file did not exist and the tests were not
 * runnable there. These implementations are rebuilt from the call sites'
 * contracts:
 *
 *   randgen(seed)                    -> { next(): number } PRNG (mulberry32)
 *   randomNumbers(gen, count, max)  -> number[] in [0..max]
 *   randomStrings(gen, count, min, max) -> string[] lowercase ASCII, len [min..max]
 *
 * Values are deterministic per seed; tests never assert specific PRNG values,
 * only round-trip and invariants over the generated inputs.
 */

export interface RandGen {
  next(): number;
}

/**
 * Mulberry32: tiny, deterministic, seeded PRNG yielding floats in [0, 1).
 */
export const randgen = (seed: number): RandGen => {
  let a = seed >>> 0;
  return {
    next: () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
};

/**
 * Returns `count` random integers in the inclusive range [0, max].
 */
export const randomNumbers = (gen: RandGen, count: number, max: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.floor(gen.next() * (max + 1)));
  }
  return out;
};

const LETTERS = 26;
const A = 97; // 'a'

/**
 * Returns `count` random lowercase-ASCII strings with length in
 * the inclusive range [min, max].
 */
export const randomStrings = (gen: RandGen, count: number, min: number, max: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = min + Math.floor(gen.next() * (max - min + 1));
    let s = '';
    for (let j = 0; j < len; j++) {
      s += String.fromCharCode(A + Math.floor(gen.next() * LETTERS));
    }
    out.push(s);
  }
  return out;
};

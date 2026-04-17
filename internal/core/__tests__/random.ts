/**
 * Deterministic random test-fixture helpers.
 *
 * Restored from the author's originals (2025-08-28); they were missing from
 * the old repo (cldr-engine-ng), so a reconstruction had briefly stood in.
 * One change vs the author's copy: the stray debug `console.log` in
 * `randomStrings` (and the discarded `gen()` draw it logged) was removed —
 * it would have printed a line per string during the 1000-string search test.
 */

/**
 * Seeded PRNG returning floats in [0, 1).
 */
export const randgen = (seed: number) => {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    seed |= 0;
    let t = (((a + b) | 0) + seed) | 0;
    seed = (seed + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
};

/**
 * Generate `count` random numbers from zero to `max` (exclusive).
 */
export const randomNumbers = (gen: () => number, count: number, max: number) => {
  const res: number[] = [];
  for (let i = 0; i < count; i++) {
    const n = (gen() * max) | 0;
    res.push(n);
  }
  return res;
};

/**
 * Generate `count` random strings whose lengths are randomly between
 * `min` and `max` (inclusive), over lowercase ASCII a-z.
 */
export const randomStrings = (gen: () => number, count: number, min: number, max: number) => {
  const range = max - min + 1;
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = Math.floor(gen() * range) + min;
    const key = randomNumbers(gen, len, 26)
      .map((c) => String.fromCharCode(c + 0x61))
      .join('');
    keys.push(key);
  }
  return keys;
};

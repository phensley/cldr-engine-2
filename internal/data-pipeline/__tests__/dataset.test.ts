/**
 * Dataset invariant tests: the mini-cldr must stay inside the shape the
 * compile step (S1-M3) will assume — sized, coded, and stressed per
 * plans/prototype-plan.md §7.
 */
import { miniCldr } from '../src/index.js';

const LOCALES = ['en', 'fr', 'de', 'es-419'];

const isUpperCode = (s: string, n: number) => /^[A-Z]+$/.test(s) && s.length === n;
const isNonAscii = (s: string) => [...s].some((c) => c.codePointAt(0)! > 127);

describe('mini-cldr dataset', () => {
  test('carries exactly the four planned locales', () => {
    expect(Object.keys(miniCldr.locales).sort()).toEqual([...LOCALES].sort());
  });

  test('territories: 10-20 keys per locale, 2-letter codes, non-empty names', () => {
    for (const locale of LOCALES) {
      const t = miniCldr.locales[locale].territories;
      const keys = Object.keys(t);
      expect(keys.length).toBeGreaterThanOrEqual(10);
      expect(keys.length).toBeLessThanOrEqual(20);
      for (const [code, name] of Object.entries(t)) {
        expect(isUpperCode(code, 2), `${locale}: ${code}`).toBe(true);
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  test('territories: every locale has non-ASCII names (pool stress)', () => {
    for (const locale of LOCALES) {
      const names = Object.values(miniCldr.locales[locale].territories);
      expect(names.some(isNonAscii), `${locale} has no non-ASCII name`).toBe(true);
    }
  });

  test('territories: shared subset + locale-specific keys', () => {
    const all = LOCALES.map((l) => new Set(Object.keys(miniCldr.locales[l].territories)));
    // GB is present in every locale
    for (const s of all) expect(s.has('GB')).toBe(true);
    // en-only key (per-locale variation exists)
    const en = all[0];
    for (const s of all.slice(1)) {
      for (const k of en) {
        if (!s.has(k)) return; // found a locale-specific key
      }
    }
    throw new Error('every en territory key is shared — no per-locale variation');
  });

  test('currencies: ~5-6 per locale, 3-letter codes, sane fraction digits', () => {
    for (const locale of LOCALES) {
      const c = miniCldr.locales[locale].currencies;
      const entries = Object.entries(c);
      expect(entries.length).toBeGreaterThanOrEqual(5);
      expect(entries.length).toBeLessThanOrEqual(6);
      for (const [code, cur] of entries) {
        expect(isUpperCode(code, 3), `${locale}: ${code}`).toBe(true);
        expect(cur.symbol.length).toBeGreaterThan(0);
        expect([0, 2]).toContain(cur.fractionDigits);
      }
    }
  });

  test('patterns: decimal/percent/currency present and non-empty', () => {
    for (const locale of LOCALES) {
      for (const key of ['decimal', 'percent', 'currency'] as const) {
        const p = miniCldr.locales[locale].patterns[key];
        expect(p.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  test('numeric: parallel arrays, u16 domain, near-ceiling stress values', () => {
    const { keys, values } = miniCldr.numeric;
    expect(keys.length).toBe(values.length);
    for (const key of keys) expect(isNonAscii(key)).toBe(false);
    for (const v of values) {
      expect(Number.isInteger(v) && v >= 0 && v <= 65535, `value ${v}`).toBe(true);
    }
    expect(values).toContain(65535);
    expect(values.filter((v) => v > 60000).length).toBeGreaterThanOrEqual(2);
    expect(values.some((v) => v < 100)).toBe(true);
  });

  test('numeric: bias-encoded offset scale is monotonic west→east', () => {
    const { keys, values } = miniCldr.numeric;
    const west = keys.indexOf('UTC-12');
    const utc = keys.indexOf('UTC');
    const east = keys.indexOf('UTC+14');
    expect(west).toBeGreaterThanOrEqual(0);
    expect(values[utc]).toBe(720); // 12h from UTC-12
    expect(values[east]).toBe(1560); // 26h from UTC-12
    expect(values[west]).toBe(0);
  });
});

/**
 * Real-CLDR adapter tests (dataset/real.ts). The values asserted are
 * FROZEN from CLDR 48.2.1 (the sha-pinned dataset version) — a changed
 * CLDR version updates the pin and these expectations together, which
 * is the point: the adapter's output is a documented, reviewable slice
 * of the source data.
 *
 * Cache-gated: the slice lives in the gitignored .cache (pnpm
 * fetch:cldr). Without it these tests skip — the offline suite (mini
 * fixtures) never needs network or cache.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLDR_VERSION, LOCALES, realCldr, realCldrStats } from '../src/dataset/real.js';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.cache', 'cldr', CLDR_VERSION);
const hasCache = existsSync(cacheDir);

describe.skipIf(!hasCache)('real CLDR adapter (48.2.1)', () => {
  const d = realCldr();

  test('decided v1 locale set; en family is a resolved superset, es-419 absent', () => {
    expect(Object.keys(d.locales).sort()).toEqual([...LOCALES].sort());
    expect(d.locales['en-001']).toBeDefined();
    expect(d.locales['es-419']).toBeUndefined();
  });

  test('deterministic: repeated loads are identical', () => {
    expect(realCldr()).toBe(d); // memoized
    expect(JSON.stringify(realCldr())).toBe(JSON.stringify(realCldr()));
  });

  test('en: symbols, patterns, names', () => {
    const en = d.locales['en'];
    expect(en.symbols).toEqual({ decimal: '.', group: ',', minus: '-', percent: '%' });
    expect(en.patterns).toEqual({ decimal: '#,##0.###', percent: '#,##0%', currency: '¤#,##0.00' });
    expect(en.territories['DE']).toBe('Germany');
    expect(en.languages['fr']).toBe('French');
    expect(en.scripts['Latn']).toBe('Latin');
    expect(en.currencies['USD']).toEqual({
      symbol: '$',
      narrowSymbol: '$',
      displayName: 'US Dollar',
      displayNameOther: 'US dollars',
      fractionDigits: 2,
    });
  });

  test('fr: U+202F grouping, NBSP-before-¤ currency pattern', () => {
    const fr = d.locales['fr'];
    expect(fr.symbols.group).toBe('\u202f'); // narrow no-break space
    expect(fr.symbols.decimal).toBe(',');
    expect(fr.patterns.currency).toBe('#,##0.00\u00a0¤');
    expect(fr.currencies['EUR'].symbol).toBe('€');
  });

  test('ar: default numbering system is latn (CLDR ≥45), RTL-aware patterns/symbols', () => {
    const ar = d.locales['ar'];
    expect(ar.patterns.currency).toBe('\u200f#,##0.00\u00a0¤'); // RTL mark + NBSP
    expect(ar.symbols.minus).toBe('\u200e-'); // LRM-prefixed minus
    expect(ar.currencies['USD'].symbol).toBe('US$');
    expect(ar.currencies['USD'].displayName).toBe('دولار أمريكي');
  });

  test('hi: Indian grouping pattern, latn default', () => {
    const hi = d.locales['hi'];
    expect(hi.patterns.decimal).toBe('#,##,##0.###');
    expect(hi.symbols.decimal).toBe('.');
  });

  test('fraction digits: ISO defaults (2), JPY 0, BHD 3, ADP 0', () => {
    const en = d.locales['en'];
    expect(en.currencies['XCD'].fractionDigits).toBe(2); // no fractions entry → default
    expect(en.currencies['JPY'].fractionDigits).toBe(0);
    expect(en.currencies['BHD'].fractionDigits).toBe(3);
    expect(en.currencies['ADP'].fractionDigits).toBe(0);
  });

  test('coverage-gap rule: missing symbol/name fall back to the code', () => {
    const en = d.locales['en'];
    // ADP has display names but no symbol in en → symbol = code
    expect(en.currencies['ADP'].symbol).toBe('ADP');
    expect(en.currencies['ADP'].displayName).toBe('Andorran Peseta');
    expect(en.currencies['ADP'].displayNameOther).toBe('Andorran pesetas');
  });

  test('patterns store the POSITIVE subpattern only (no ";" anywhere)', () => {
    for (const loc of Object.values(d.locales)) {
      for (const p of Object.values(loc.patterns)) {
        expect(p.includes(';'), `${loc} pattern '${p}'`).toBe(false);
      }
    }
  });

  test('real scale: en family ~316 territories / ~690 languages / ~220 scripts / ~307 currencies', () => {
    const s = realCldrStats();
    expect(s['en']).toEqual({ territories: 316, languages: 693, scripts: 220, currencies: 307 });
    expect(s['en-GB']).toEqual(s['en']); // fully resolved per-locale files
    expect(s['hi'].currencies).toBeLessThan(s['en'].currencies); // real per-locale variation
  });
});

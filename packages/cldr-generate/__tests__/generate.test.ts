/**
 * Generator tests: config validation, emission content (golden-ish
 * assertions on the emitted literal imports — the absence proofs of S2),
 * and the write path.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, generate, writeClient } from '../src/index.js';

const full = defineConfig({
  locales: ['en', 'de', 'fr'],
  features: {
    decimal: { compare: true, min: true, format: { scientific: true } },
    currency: true,
  },
});

const decimalOnly = defineConfig({
  locales: ['en'],
  features: { decimal: { compare: true } },
});

describe('config surface', () => {
  test('defineConfig is a typed identity', () => {
    expect(defineConfig({ locales: ['en'], features: {} })).toEqual({ locales: ['en'], features: {} });
  });
});

describe('generate — full eager client', () => {
  const code = generate(full);

  test('imports exactly the selected methods + runtime + packs', () => {
    expect(code).toContain("import { createCldr, makeCurrencyFactory, makeDecimalFactory } from '@phensley/cldr';");
    for (const spec of [
      '@phensley/cldr/decimal/compare',
      '@phensley/cldr/decimal/min',
      '@phensley/cldr/decimal/format/scientific',
      '@phensley/cldr/currency/format',
      '@phensley/cldr/currency/symbol',
      '@phensley/cldr/currency/fraction-digits',
      "@phensley/cldr/packs/en'",
      "@phensley/cldr/packs/de'",
      "@phensley/cldr/packs/fr'",
    ]) {
      expect(code, spec).toContain(spec);
    }
  });

  test('unselected slots are absent (no max, no movePoint, no unconfigured packs)', () => {
    expect(code).not.toContain('decimal/max');
    expect(code).not.toContain('move-point');
    expect(code).not.toContain('@phensley/cldr/packs/zh'); // unconfigured
  });

  test('emitted build is annotated with the DecodedLocalePack union', () => {
    expect(code).toContain('const build = (pack: DecodedLocalePack | undefined) => ({');
  });

  test('emits literal locale union + static sync packs', () => {
    expect(code).toContain('locales: ["en","de","fr"] as const');
    expect(code).toContain("packs: { \"en\": en, \"de\": de, \"fr\": fr }");
  });
});

describe('generate — decimal-only (no locale data)', () => {
  const code = generate(decimalOnly);

  test('no packs, no currency, no locale machinery', () => {
    expect(code).not.toContain('@phensley/cldr/packs/');
    expect(code).not.toContain('currency');
    expect(code).not.toContain('makeCurrencyFactory');
    expect(code).not.toContain('preload');
  });

  test('build takes no pack', () => {
    expect(code).toContain('const build = () => ({');
    expect(code).toContain('decimal,');
    expect(code).not.toContain('pack!');
  });
});

describe('generate — validation', () => {
  test('unknown feature fails listing valid features', () => {
    expect(() => generate({ locales: ['en'], features: { calendar: true } })).toThrow(
      /unknown feature "calendar" \(valid: decimal, currency\)/,
    );
  });
  test('unknown slot fails listing valid slots', () => {
    expect(() => generate({ locales: ['en'], features: { decimal: { subtract: true } } })).toThrow(
      /unknown selection "subtract" \(valid: compare, min, max, movePoint, format.scientific\)/,
    );
  });
  test('unknown namespace slot fails', () => {
    expect(() => generate({ locales: ['en'], features: { decimal: { format: { engineering: true } } } })).toThrow(
      /unknown selection "format.engineering"/,
    );
  });
  test('non-boolean method slot fails', () => {
    expect(() => generate({ locales: ['en'], features: { decimal: { compare: { a: true } } } })).toThrow(
      /selection "compare" must be boolean/,
    );
  });
  test('unknown locale fails listing available packs', () => {
    expect(() => generate({ locales: ['xx'], features: { currency: true } })).toThrow(
      /locale "xx" has no runtime pack/,
    );
  });
  test('empty selection fails', () => {
    expect(() => generate({ locales: ['en'], features: { decimal: {} } })).toThrow(/selects no features/);
  });
});

describe('writeClient', () => {
  test('writes the same code generate() returns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cldr-gen-'));
    const out = join(dir, 'src', 'cldr.gen.ts');
    const wrote = writeClient(full, out);
    expect(readFileSync(out, 'utf8')).toBe(wrote);
    expect(wrote).toBe(generate(full));
  });
});

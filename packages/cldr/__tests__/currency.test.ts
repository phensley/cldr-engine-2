/**
 * Currency feature tests against the committed REAL packs (CLDR 48.2.1).
 * Golden values are real CLDR renders: fr uses U+202F grouping and a
 * NBSP before the ¤ suffix; de uses '.' grouping + ',' decimal.
 */
import { decodeLocalePack } from '@cldr/internal-core';
import { makeCurrencyFactory } from '../src/index.js';
import { format } from '@phensley/cldr/currency/format';
import { fractionDigits } from '@phensley/cldr/currency/fraction-digits';
import { symbol } from '@phensley/cldr/currency/symbol';
import { en } from '@phensley/cldr/packs/en';
import { de } from '@phensley/cldr/packs/de';
import { fr } from '@phensley/cldr/packs/fr';

const enCtx = { pack: decodeLocalePack(en), locale: 'en' } as const;
const frCtx = { pack: decodeLocalePack(fr), locale: 'fr' } as const;
const deCtx = { pack: decodeLocalePack(de), locale: 'de' } as const;

describe('currency methods', () => {
  const factory = (ctx: { pack: ReturnType<typeof decodeLocalePack>; locale: string }) =>
    makeCurrencyFactory(ctx.pack, { format, symbol, fractionDigits });

  test('symbol + fraction digits resolve through trie → table → pool', () => {
    const en = factory(enCtx);
    expect(en.new('1', 'USD').symbol()).toBe('$');
    expect(en.new('1', 'JPY').symbol()).toBe('¥');
    expect(en.new('1', 'USD').fractionDigits()).toBe(2);
    expect(en.new('1', 'JPY').fractionDigits()).toBe(0);
  });

  test('format: locale pattern + symbol + digits rounding + locale symbols', () => {
    expect(factory(enCtx).new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(factory(enCtx).new('1234.56', 'JPY').format()).toBe('¥1,235'); // 0 digits → rounds
    expect(factory(frCtx).new('1234.5', 'EUR').format()).toBe('1\u202f234,50\u00a0€'); // U+202F group, NBSP before ¤
    expect(factory(deCtx).new('1234.5', 'EUR').format()).toBe('1.234,50\u00a0€'); // '.' group, ',' decimal
    expect(factory(deCtx).new('999.99', 'MXN').format()).toBe('999,99\u00a0MX$');
    expect(factory(enCtx).new('-42', 'USD').format()).toBe('-$42.00');
  });

  test('unknown currency code throws', () => {
    // 'XXX' is a REAL CLDR code ("no currency", symbol '¤') — use a made-up one
    expect(() => factory(enCtx).new('1', 'ZZZ').symbol()).toThrow(/not in this locale's pack/);
    expect(() => factory(enCtx).new('1', 'ZZZ').format()).toThrow(/not in this locale's pack/);
  });

  test('real digits: JPY 0, BHD 3, ADP 0 (ISO defaults 2 elsewhere)', () => {
    expect(factory(enCtx).new('1', 'BHD').fractionDigits()).toBe(3);
    expect(factory(enCtx).new('1', 'ADP').fractionDigits()).toBe(0);
    expect(factory(enCtx).new('1', 'XCD').fractionDigits()).toBe(2);
  });

  test('de pack resolves its own names (Mexiko / MX$); en pack does not carry them', () => {
    const de = factory(deCtx);
    expect(de.new('5', 'MXN').symbol()).toBe('MX$');
    const enPool = new Set(enCtx.pack.pool);
    expect(enPool.has('Mexiko')).toBe(false);
    expect(enPool.has('Deutschland')).toBe(false);
  });
});

/**
 * Currency feature tests against the committed runtime packs.
 */
import { decodeLocalePack } from '@cldr/internal-core';
import { makeCurrencyFactory } from '../src/index.js';
import { format } from '@phensley/cldr/currency/format';
import { fractionDigits } from '@phensley/cldr/currency/fraction-digits';
import { symbol } from '@phensley/cldr/currency/symbol';
import { en } from '@phensley/cldr/packs/en';
import { es419 } from '@phensley/cldr/packs/es419';
import { fr } from '@phensley/cldr/packs/fr';

const enCtx = { pack: decodeLocalePack(en), locale: 'en' } as const;
const frCtx = { pack: decodeLocalePack(fr), locale: 'fr' } as const;
const esCtx = { pack: decodeLocalePack(es419), locale: 'es-419' } as const;

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

  test('format: locale pattern + symbol + digits rounding', () => {
    expect(factory(enCtx).new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(factory(enCtx).new('1234.56', 'JPY').format()).toBe('¥1,235'); // 0 digits → rounds
    expect(factory(frCtx).new('1234.5', 'EUR').format()).toBe('1,234.50\u00a0€');
    expect(factory(esCtx).new('999.99', 'MXN').format()).toBe('MX$999.99');
    expect(factory(enCtx).new('-42', 'USD').format()).toBe('-$42.00');
  });

  test('unknown currency code throws', () => {
    expect(() => factory(enCtx).new('1', 'XXX').symbol()).toThrow(/not in this locale's pack/);
    expect(() => factory(enCtx).new('1', 'XXX').format()).toThrow(/not in this locale's pack/);
  });

  test('es-419 pack resolves its own names (México / MX$)', () => {
    const es = factory(esCtx);
    expect(es.new('5', 'MXN').symbol()).toBe('MX$');
    // en pack does not carry es-419 territory names, and vice versa
    const enPool = new Set(enCtx.pack.pool);
    expect(enPool.has('México')).toBe(false);
  });
});

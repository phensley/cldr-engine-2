/**
 * Real-format golden tests (plans/real-cldr-compiler.md Phase C):
 * the committed REAL packs (CLDR 48.2.1) formatted through the runtime
 * must produce the documented CLDR renders, across scripts.
 *
 * Values are frozen from the sha-pinned CLDR 48.2.1 data — a version
 * bump updates pin and expectations together (see also
 * real-dataset.test.ts). Patterns/symbols come from the wire v1 pack;
 * everything is exercised through the public factory assembly.
 */
import { decodeLocalePack, lookupTrieValue } from '@cldr/internal-core';
import { makeCurrencyFactory } from '../src/index.js';
import { format } from '@phensley/cldr/currency/format';
import { symbol } from '@phensley/cldr/currency/symbol';
import { fractionDigits } from '@phensley/cldr/currency/fraction-digits';
import { en } from '@phensley/cldr/packs/en';
import { de } from '@phensley/cldr/packs/de';
import { fr } from '@phensley/cldr/packs/fr';
import { zh } from '@phensley/cldr/packs/zh';
import { ar } from '@phensley/cldr/packs/ar';
import { hi } from '@phensley/cldr/packs/hi';
import { ru } from '@phensley/cldr/packs/ru';

const packs = { en, de, fr, zh, ar, hi, ru };
const cur = (tag: keyof typeof packs) =>
  makeCurrencyFactory(decodeLocalePack(packs[tag]), { format, symbol, fractionDigits });

describe('real CLDR renders (48.2.1) — currency through the public factory', () => {
  test('en: Latin, ./, groupings, $', () => {
    const f = cur('en');
    expect(f.new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(f.new('1234567.89', 'USD').format()).toBe('$1,234,567.89');
    expect(f.new('-42.5', 'USD').format()).toBe('-$42.50');
    expect(f.new('5', 'JPY').format()).toBe('¥5'); // 0 digits → no fraction
    expect(f.new('1', 'GBP').symbol()).toBe('£');
    expect(f.new('1', 'BHD').fractionDigits()).toBe(3);
  });

  test("de: '.' grouping, ',' decimal, NBSP before ¤ suffix", () => {
    const f = cur('de');
    expect(f.new('1234.5', 'USD').format()).toBe('1.234,50\u00a0$');
    expect(f.new('1234567.89', 'USD').format()).toBe('1.234.567,89\u00a0$');
    expect(f.new('-42.5', 'USD').format()).toBe('-42,50\u00a0$');
    expect(f.new('1234.5', 'EUR').format()).toBe('1.234,50\u00a0€');
  });

  test("fr: U+202F grouping, ',' decimal, $US", () => {
    const f = cur('fr');
    expect(f.new('1234.5', 'USD').format()).toBe('1\u202f234,50\u00a0$US');
    expect(f.new('1234567.89', 'USD').format()).toBe('1\u202f234\u202f567,89\u00a0$US');
    expect(f.new('1234.5', 'EUR').format()).toBe('1\u202f234,50\u00a0€');
  });

  test('zh: CJK locale, US$/JP¥/CN¥ symbols, latn digits', () => {
    const f = cur('zh');
    expect(f.new('1234.5', 'USD').format()).toBe('US$1,234.50');
    expect(f.new('5', 'JPY').format()).toBe('JP¥5');
    expect(f.new('1234.5', 'EUR').format()).toBe('€1,234.50');
  });

  test('ar: RTL-mark prefix + LRM minus + US$/UK£ symbols', () => {
    const f = cur('ar');
    expect(f.new('1234.5', 'USD').format()).toBe('\u200f1,234.50\u00a0US$');
    expect(f.new('-42.5', 'USD').format()).toBe('\u200e-\u200f42.50\u00a0US$');
    expect(f.new('1', 'GBP').symbol()).toBe('UK£');
  });

  test('hi: Indian grouping (#,##,##0.### → 12,34,567)', () => {
    const f = cur('hi');
    expect(f.new('1234567.89', 'USD').format()).toBe('$12,34,567.89');
    expect(f.new('1234.5', 'USD').format()).toBe('$1,234.50');
  });

  test('ru: NBSP grouping, comma decimal', () => {
    const f = cur('ru');
    expect(f.new('1234.5', 'USD').format()).toBe('1\u00a0234,50\u00a0$');
    expect(f.new('1234567.89', 'USD').format()).toBe('1\u00a0234\u00a0567,89\u00a0$');
  });

  test('wire v1: language/script tries decode to real display names', () => {
    const dec = decodeLocalePack(en);
    expect(dec.pool[lookupTrieValue('fr', dec.languageTrie)!]).toBe('French');
    expect(dec.pool[lookupTrieValue('de', dec.languageTrie)!]).toBe('German');
    expect(dec.pool[lookupTrieValue('Latn', dec.scriptTrie)!]).toBe('Latin');
    expect(dec.pool[lookupTrieValue('Cyrl', dec.scriptTrie)!]).toBe('Cyrillic');
    expect(dec.symbols).toEqual(['.', ',', '-', '%']); // [decimal, group, minus, percent]
  });
});

/**
 * Full-universe locale goldens (coverage milestone 2, cache-gated): a
 * spread of new locales rendered through the real factories from the
 * full compile — the published-universe behavior (the 11-locale
 * regression corpus is covered by the committed-pack tests).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeLocalePack, decodeZonesTable } from '@cldr/internal-core';
import { compileDataset } from '../src/index.js';
import { makeCurrencyFactory, makePluralFactory, makeCalendarFactory } from '../../../packages/cldr/src/index.js';
import { format as curFormat } from '@phensley/cldr/currency/format';
import { symbol } from '@phensley/cldr/currency/symbol';
import { fractionDigits } from '@phensley/cldr/currency/fraction-digits';
import { select } from '@phensley/cldr/plural/select';
import { format as calFormat, offset } from '@phensley/cldr/calendar/format';
import { realCldr } from '../src/dataset/real.js';
import { zones } from '../generated-full/zones.js';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.cache', 'cldr', '48.2.1');
const hasCache = existsSync(join(cacheDir, 'cldr-numbers-full', 'main', 'en', 'numbers.json'));

describe.skipIf(!hasCache)('full universe — new-locale goldens', () => {
  const compiled = compileDataset(realCldr({ full: true }));
  const zonesTable = decodeZonesTable(zones);
  const currency = (tag: string) => makeCurrencyFactory(decodeLocalePack(compiled.locale[tag]), { format: curFormat, symbol, fractionDigits });
  const plural = (tag: string) => makePluralFactory(decodeLocalePack(compiled.locale[tag]), { select });
  const calendar = (tag: string) => makeCalendarFactory(decodeLocalePack(compiled.locale[tag]), zonesTable, { format: calFormat, offset });

  test('ja: JPY 0-digit rounding + CJK calendar + other-only plural', () => {
    expect(currency('ja').new('1234.56', 'JPY').format()).toBe('￥1,235');
    expect(currency('ja').new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(plural('ja').new('1').select()).toBe('other');
    expect(calendar('ja').new(new Date('2025-03-04T12:00:00Z')).format()).toBe('2025年3月4日火曜日');
  });

  test('ko: CJK calendar + KRW', () => {
    expect(currency('ko').new('1234.5', 'KRW').format()).toBe('₩1,235');
    expect(calendar('ko').new(new Date('2025-03-04T12:00:00Z')).format()).toBe('2025년 3월 4일 화요일');
  });

  test('tr: one/other + TL', () => {
    expect(currency('tr').new('12', 'TRY').format()).toBe('₺12,00');
    expect(plural('tr').new('1').select()).toBe('one');
    expect(plural('tr').new('2').select()).toBe('other');
  });

  test('th: THB + Buddhist-era calendar year (y = 2568)', () => {
    expect(currency('th').new('1234.5', 'THB').format()).toBe('฿1,234.50');
    // gregorian slice: the year is CE 2025; the Buddhist-era year belongs to the
    // non-gregorian calendar systems (product backlog)
    expect(calendar('th').new(new Date('2025-03-04T12:00:00Z')).format('short')).toBe('4/3/25');
  });

  test('uk: one/few/many + UAH', () => {
    expect(currency('uk').new('1234.5', 'UAH').format()).toBe('1\u00a0234,50\u00a0₴');
    expect(plural('uk').new('1').select()).toBe('one');
    expect(plural('uk').new('2').select()).toBe('few');
    expect(plural('uk').new('11').select()).toBe('many');
  });

  test('he: RTL + ILS', () => {
    expect(currency('he').new('1234.5', 'ILS').format()).toBe('\u200f1,234.50\u00a0\u200f₪'); // bidi-marked pattern
    expect(calendar('he').new(new Date('2025-03-04T12:00:00Z')).format('short')).toBe('4.3.2025');
  });
});

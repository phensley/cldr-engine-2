/**
 * Plural feature goldens — real CLDR 48.2.1 rules through the public
 * factory assembly (the generated-client composition shape).
 */
import { decodeLocalePack } from '@cldr/internal-core';
import { makePluralFactory } from '../src/index.js';
import { select } from '@phensley/cldr/plural/select';
import { en } from '@phensley/cldr/packs/en';
import { ar } from '@phensley/cldr/packs/ar';
import { ru } from '@phensley/cldr/packs/ru';
import { fr } from '@phensley/cldr/packs/fr';
import { hi } from '@phensley/cldr/packs/hi';
import { zh } from '@phensley/cldr/packs/zh';

const plural = (p: typeof en) => makePluralFactory(decodeLocalePack(p), { select });

const cats = (f: ReturnType<typeof plural>, n: string) => f.new(n).select();

describe('plural (real CLDR 48.2.1 rules)', () => {
  test('en: one / other; ordinals one/two/few/other', () => {
    const f = plural(en);
    expect(cats(f, '1')).toBe('one');
    expect(cats(f, '0')).toBe('other');
    expect(cats(f, '2')).toBe('other');
    expect(cats(f, '1.5')).toBe('other');
    expect(f.new('1').select('ordinal')).toBe('one');
    expect(f.new('2').select('ordinal')).toBe('two');
    expect(f.new('3').select('ordinal')).toBe('few');
    expect(f.new('4').select('ordinal')).toBe('other');
    expect(f.new('21').select('ordinal')).toBe('one');
    expect(f.new('11').select('ordinal')).toBe('other');
  });

  test('ar: zero/one/two/few/many spectrum', () => {
    const f = plural(ar);
    expect(cats(f, '0')).toBe('zero');
    expect(cats(f, '1')).toBe('one');
    expect(cats(f, '2')).toBe('two');
    expect(cats(f, '3')).toBe('few');
    expect(cats(f, '11')).toBe('many');
    expect(cats(f, '100')).toBe('other');
  });

  test('ru: v=0 integer rules (1→one, 2→few, 5→many, 21→one, 11→many)', () => {
    const f = plural(ru);
    expect(cats(f, '1')).toBe('one');
    expect(cats(f, '21')).toBe('one');
    expect(cats(f, '2')).toBe('few');
    expect(cats(f, '5')).toBe('many');
    expect(cats(f, '11')).toBe('many');
    expect(cats(f, '1.5')).toBe('other'); // v != 0 → no rule matches
  });

  test('fr: i = 0,1 → 0 and 1.5 are "one"', () => {
    const f = plural(fr);
    expect(cats(f, '0')).toBe('one');
    expect(cats(f, '1')).toBe('one');
    expect(cats(f, '1.5')).toBe('one');
    expect(cats(f, '2')).toBe('other');
  });

  test('hi: i = 0 or n = 1', () => {
    const f = plural(hi);
    expect(cats(f, '0')).toBe('one');
    expect(cats(f, '1')).toBe('one');
    expect(cats(f, '2')).toBe('other');
  });

  test('zh: other only', () => {
    const f = plural(zh);
    expect(cats(f, '1')).toBe('other');
    expect(cats(f, '0')).toBe('other');
  });
});

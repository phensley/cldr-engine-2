/**
 * Plural rule compiler tests (offline — synthetic conditions + the
 * mini fixture): grammar parse, flat encode → core decode → evaluate.
 */
import { decodeLocalePack, decodePluralRules, evaluatePlural, PLURAL_CATEGORIES } from '@cldr/internal-core';
import { compileDataset, miniCldr } from '../src/index.js';
import { encodePluralRules, parseCondition } from '../src/compile/plural.js';

const CATS = PLURAL_CATEGORIES;
const ops = (n: number) => {
  const s = String(n);
  const [int, frac = ''] = s.split('.');
  const f = frac === '' ? 0 : Number(frac);
  return { n, i: Number(int), v: frac.length, w: String(frac.replace(/0+$/, '')).length, f, t: Number(frac.replace(/0+$/, '') || '0'), e: 0 };
};
const catOf = (rules: number[], n: number) => CATS[evaluatePlural(ops(n), decodePluralRules(rules))];

describe('plural rule compilation', () => {
  test('grammar: or/and groups, mod, ranges, negation, e operand, big mods', () => {
    expect(parseCondition('n = 1')).toEqual([[{ operand: 0, mod: 0, eq: true, ranges: [[1, 1]] }]]);
    expect(parseCondition('n % 10 = 2..4 and n % 100 != 12..14')).toEqual([
      [
        { operand: 0, mod: 10, eq: true, ranges: [[2, 4]] },
        { operand: 0, mod: 100, eq: false, ranges: [[12, 14]] },
      ],
    ]);
    expect(parseCondition('i = 0,1')).toEqual([[{ operand: 1, mod: 0, eq: true, ranges: [[0, 0], [1, 1]] }]]);
    expect(parseCondition('e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5')).toEqual([
      [
        { operand: 6, mod: 0, eq: true, ranges: [[0, 0]] },
        { operand: 1, mod: 0, eq: false, ranges: [[0, 0]] },
        { operand: 1, mod: 1000000, eq: true, ranges: [[0, 0]] },
        { operand: 2, mod: 0, eq: true, ranges: [[0, 0]] },
      ],
      [{ operand: 6, mod: 0, eq: false, ranges: [[0, 5]] }],
    ]);
    expect(parseCondition(' ')).toEqual([]); // 'other' — always matches
  });

  test('encode → decode → evaluate: ru-shaped rules', () => {
    const rules = encodePluralRules({
      one: 'v = 0 and i % 10 = 1 and i % 100 != 11',
      few: 'v = 0 and i % 10 = 2..4 and i % 100 != 12..14',
      many: 'v = 0 and i % 10 = 0 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 11..14',
      other: '',
    });
    expect(catOf(rules, 1)).toBe('one');
    expect(catOf(rules, 21)).toBe('one');
    expect(catOf(rules, 2)).toBe('few');
    expect(catOf(rules, 5)).toBe('many');
    expect(catOf(rules, 11)).toBe('many');
    expect(catOf(rules, 1.5)).toBe('other');
    expect(catOf(rules, 100)).toBe('many');
  });

  test('fr-style: e operand + large mod evaluate', () => {
    const rules = encodePluralRules({
      one: 'i = 0,1',
      many: 'e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5',
      other: '',
    });
    expect(catOf(rules, 0)).toBe('one');
    expect(catOf(rules, 1.5)).toBe('one');
    expect(catOf(rules, 1000000)).toBe('many');
    expect(catOf(rules, 2)).toBe('other');
  });

  test('empty ruleset encodes to other-only', () => {
    expect(catOf(encodePluralRules({}), 42)).toBe('other');
  });

  test('mini fixture: en compiles and evaluates (offline path)', () => {
    const compiled = compileDataset(miniCldr);
    const dec = decodeLocalePack(compiled.locale.en);
    expect(catOf(compiled.locale.en.plural.cardinal, 1)).toBe('one');
    expect(catOf(compiled.locale.en.plural.cardinal, 2)).toBe('other');
    expect(dec.plural.ordinal.length).toBe(1); // other-only → single always-true rule
    expect(dec.plural.cardinal[0].cat).toBe(CATS.indexOf('one'));
  });
});

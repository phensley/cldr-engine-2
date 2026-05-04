/**
 * Factory tests: selected methods become the instance's typed surface;
 * unselected slots are absent (compile-time, asserted via @ts-expect-error).
 */
import { makeDecimalFactory } from '../src/index.js';
import { compare } from '@phensley/cldr/decimal/compare';
import { min } from '@phensley/cldr/decimal/min';
import { movePoint } from '@phensley/cldr/decimal/move-point';
import { scientific } from '@phensley/cldr/decimal/format/scientific';

describe('makeDecimalFactory', () => {
  test('instances expose exactly the selected methods', () => {
    const decimal = makeDecimalFactory({ compare, min, format: { scientific } });
    const a = decimal.new('10');
    const b = decimal.new('2.5');

    expect(a.compare(b)).toBe(1);
    expect(a.compare('10')).toBe(0);
    const smaller = a.min(b);
    expect(smaller.compare(b)).toBe(0);
    expect(smaller.compare('2.4')).toBe(1);
    expect(smaller.format.scientific()).toBe('2.5e+0');
    expect(smaller.format.scientific({ fractionDigits: 1 })).toBe('2.5e+0');

    // min returns a new instance carrying the same selected surface
    expect(typeof smaller.min).toBe('function');
    expect(typeof smaller.compare).toBe('function');
  });

  test('state-returning methods produce fresh instances, not shared state', () => {
    const decimal = makeDecimalFactory({ compare, min, movePoint });
    const a = decimal.new('1');
    const c = a.min('2'); // c = 1 (the state is kept, not the argument)
    const m1 = c.movePoint(2);
    expect(m1).not.toBe(c);
    expect(m1.compare('100')).toBe(0); // m1 = 100
    expect(m1.compare('1')).toBe(1);
    expect(c.compare('2')).toBe(-1); // c untouched
  });

  test('unselected slots are type-absent', () => {
    const decimal = makeDecimalFactory({ compare });
    const d = decimal.new('1');
    // @ts-expect-error — max was not selected
    d.max;
    // @ts-expect-error — format namespace was not selected
    d.format;
    expect(d.compare('0')).toBe(1);
  });

  test('invalid raw input throws at construction', () => {
    const decimal = makeDecimalFactory({ compare });
    expect(() => decimal.new('not-a-number')).toThrow();
  });
});

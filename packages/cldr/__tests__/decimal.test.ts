/**
 * Decimal interior tests: parsing, comparison, movePoint, scientific
 * formatting, and the mini pattern formatter.
 */
import { compare } from '@phensley/cldr/decimal/compare';
import { max } from '@phensley/cldr/decimal/max';
import { min } from '@phensley/cldr/decimal/min';
import { movePoint } from '@phensley/cldr/decimal/move-point';
import { scientific } from '../src/decimal/format/scientific.js';
import { formatPattern } from '../src/decimal/format/pattern.js';
import { compareStates, parseDecimal } from '../src/decimal/state.js';

describe('parseDecimal', () => {
  test('canonicalizes plain values', () => {
    expect(parseDecimal('3.14')).toEqual({ sign: 1, coeff: [3, 1, 4], exp: -2 });
    expect(parseDecimal('-0.5')).toEqual({ sign: -1, coeff: [5], exp: -1 });
    expect(parseDecimal('120')).toEqual({ sign: 1, coeff: [1, 2], exp: 1 });
    expect(parseDecimal('0.05')).toEqual({ sign: 1, coeff: [5], exp: -2 });
    expect(parseDecimal('+7')).toEqual({ sign: 1, coeff: [7], exp: 0 });
  });
  test('handles exponent notation (numbers stringify with e for large/small)', () => {
    expect(parseDecimal('1e3')).toEqual({ sign: 1, coeff: [1], exp: 3 });
    expect(parseDecimal('1.23e-4')).toEqual({ sign: 1, coeff: [1, 2, 3], exp: -6 });
  });
  test('normalizes zero (sign + exponent)', () => {
    expect(parseDecimal('0')).toEqual({ sign: 1, coeff: [0], exp: 0 });
    expect(parseDecimal('-0')).toEqual({ sign: 1, coeff: [0], exp: 0 });
    expect(parseDecimal('0.00')).toEqual({ sign: 1, coeff: [0], exp: 0 });
    expect(parseDecimal('000123')).toEqual({ sign: 1, coeff: [1, 2, 3], exp: 0 });
  });
  test('throws on malformed input', () => {
    expect(() => parseDecimal('abc')).toThrow();
    expect(() => parseDecimal('1.2.3')).toThrow();
    expect(() => parseDecimal('')).toThrow();
    expect(() => parseDecimal('NaN')).toThrow();
  });
});

describe('compare', () => {
  test('orders magnitudes correctly', () => {
    expect(compareStates(parseDecimal('1.23'), parseDecimal('1.24'))).toBe(-1);
    expect(compareStates(parseDecimal('100'), parseDecimal('99.9'))).toBe(1);
    expect(compareStates(parseDecimal('0.001'), parseDecimal('0.0009'))).toBe(1);
    expect(compareStates(parseDecimal('-3'), parseDecimal('-2.99'))).toBe(-1);
    expect(compareStates(parseDecimal('-3'), parseDecimal('2'))).toBe(-1);
    expect(compareStates(parseDecimal('12345'), parseDecimal('12344.9999'))).toBe(1);
  });
  test('equal values compare 0 regardless of representation', () => {
    expect(compareStates(parseDecimal('1.23'), parseDecimal('1.230'))).toBe(0);
    expect(compareStates(parseDecimal('0'), parseDecimal('-0'))).toBe(0);
    expect(compareStates(parseDecimal('2.5e2'), parseDecimal('250'))).toBe(0);
  });
  test('method form accepts strings/numbers', () => {
    expect(compare(parseDecimal('2'), '2.0001')).toBe(-1);
    expect(compare(parseDecimal('2'), 2)).toBe(0);
  });
});

describe('min/max/movePoint', () => {
  test('min/max pick the correct state', () => {
    expect(min(parseDecimal('-1'), parseDecimal('1')).coeff).toEqual([1]);
    expect(min(parseDecimal('-1'), parseDecimal('1')).sign).toBe(-1);
    expect(max(parseDecimal('-1'), parseDecimal('1')).sign).toBe(1);
  });
  test('movePoint scales by powers of ten', () => {
    expect(compareStates(movePoint(parseDecimal('1.23'), 2), parseDecimal('123'))).toBe(0);
    expect(compareStates(movePoint(parseDecimal('1.23'), -2), parseDecimal('0.0123'))).toBe(0);
  });
});

describe('scientific', () => {
  test('formats mantissa + signed exponent', () => {
    expect(scientific(parseDecimal('1.23'))).toBe('1.23e+0');
    expect(scientific(parseDecimal('123'))).toBe('1.23e+2');
    expect(scientific(parseDecimal('0.000123'))).toBe('1.23e-4');
    expect(scientific(parseDecimal('-123'))).toBe('-1.23e+2');
    expect(scientific(parseDecimal('0'))).toBe('0');
  });
  test('fractionDigits truncates and pads', () => {
    expect(scientific(parseDecimal('1.2345'), { fractionDigits: 2 })).toBe('1.23e+0');
    expect(scientific(parseDecimal('1.2'), { fractionDigits: 5 })).toBe('1.20000e+0');
    expect(scientific(parseDecimal('7'), { fractionDigits: 2 })).toBe('7.00e+0');
    expect(scientific(parseDecimal('-7'), { fractionDigits: 0 })).toBe('-7e+0');
  });
});

describe('formatPattern (mini pattern formatter)', () => {
  test('decimal pattern with grouping', () => {
    expect(formatPattern(parseDecimal('1234.5'), '#,##0.###')).toBe('1,234.5');
    expect(formatPattern(parseDecimal('1234567'), '#,##0.###')).toBe('1,234,567');
    expect(formatPattern(parseDecimal('0.005'), '#,##0.###')).toBe('0.005');
    expect(formatPattern(parseDecimal('-12'), '#,##0.###')).toBe('-12');
  });
  test('percent pattern multiplies by 100', () => {
    expect(formatPattern(parseDecimal('0.5'), '#,##0%')).toBe('50%');
    expect(formatPattern(parseDecimal('0.1234'), '#,##0\u00a0%')).toBe('12\u00a0%');
  });
  test('currency pattern with symbol substitution', () => {
    expect(formatPattern(parseDecimal('1234.5'), '¤#,##0.00', { symbol: '$' })).toBe('$1,234.50');
    expect(formatPattern(parseDecimal('1234.5'), '#,##0.00\u00a0¤', { symbol: '€' })).toBe('1,234.50\u00a0€');
  });
  test('rounds half-up with carry', () => {
    expect(formatPattern(parseDecimal('1.005'), '¤#,##0.00', { symbol: '$' })).toBe('$1.01');
    expect(formatPattern(parseDecimal('9.999'), '#,##0.00')).toBe('10.00');
    expect(formatPattern(parseDecimal('99.99'), '#,##0.0')).toBe('100.0');
  });
  test('maxFrac override (JPY-style zero digits)', () => {
    expect(formatPattern(parseDecimal('1234.56'), '¤#,##0.00', { symbol: '¥', maxFrac: 0 })).toBe('¥1,235');
  });
});

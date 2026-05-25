/**
 * format(): format an amount with the locale's currency pattern, code's
 * symbol, and LOCALE symbols (wire v1: the decimal/group separators and
 * minus sign come from pack.symbols — fr renders U+202F grouping, etc.).
 * Rounds to the code's fraction digits (e.g. JPY = 0).
 */
import { formatPattern } from '../decimal/format/pattern.js';
import { currencyRecord } from './lookup.js';
import type { CurrencyState } from './state.js';

export const format = (state: CurrencyState): string => {
  const rec = currencyRecord(state);
  const pattern = state.pack.patterns[2]; // [decimal, percent, currency]
  const [decimal, group, minus] = state.pack.symbols; // [decimal, group, minus, percent]
  return formatPattern(state.amount, pattern, {
    symbol: state.pack.pool[rec.poolIndex],
    maxFrac: rec.digits,
    symbols: { decimal, group, minus },
  });
};

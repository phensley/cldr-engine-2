/**
 * The consumer app shell the bundle-proof harness bundles. Imports the
 * generated client and exercises every selected method so nothing is
 * dead-code-eliminated away from the measurement.
 */
import { cldr } from './cldr.gen.js';

export const run = (locale: 'en' | 'de' | 'fr') => {
  const ctx = cldr.get(locale);
  const total = ctx.currency.new('1234.5', 'USD').format();
  const cheapest = ctx.decimal.new('0.99').min(1.5);
  const ratio = cheapest.format.scientific();
  return `${total} / ${ratio} / ${cheapest.compare('1.0')}`;
};

export const greeting = (locale: 'en' | 'de' | 'fr') => {
  const symbol = cldr.get(locale).currency.new('1', 'USD').symbol();
  return `${symbol} ${cldr.get(locale).currency.new('5', 'USD').fractionDigits()}`;
};

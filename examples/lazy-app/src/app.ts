/**
 * Lazy consumer app shell: resolves an arbitrary visitor locale per
 * request — `await cldr.preload(locale)` before any `cldr.get(locale)`.
 */
import { cldr } from './cldr.gen.js';

export const quote = async (locale: string) => {
  await cldr.preload(locale);
  return cldr.get(locale).currency.new('1234.5', 'EUR').format();
};

export const compareQuote = async (locale: string, other: string) => {
  await cldr.preload(locale);
  return cldr.get(locale).decimal.new('0.99').min(other).format.scientific();
};

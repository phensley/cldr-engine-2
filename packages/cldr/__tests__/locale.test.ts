/**
 * Locale resolution tests.
 */
import { resolveLocale } from '../src/locale.js';

describe('resolveLocale', () => {
  const available = ['en', 'fr', 'de', 'es-419'] as const;

  test('exact match is case-insensitive and returns the canonical tag', () => {
    expect(resolveLocale('en', available)).toBe('en');
    expect(resolveLocale('EN', available)).toBe('en');
    expect(resolveLocale('ES-419', available)).toBe('es-419');
    expect(resolveLocale('Es-419', available)).toBe('es-419');
  });

  test('unavailable locale throws with the available list', () => {
    expect(() => resolveLocale('de-CH', available)).toThrow(/available: en, fr, de, es-419/);
    expect(() => resolveLocale('xx', available)).toThrow();
  });
});

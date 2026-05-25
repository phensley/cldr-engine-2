/**
 * Locale resolution tests.
 */
import { resolveLocale } from '../src/locale.js';

describe('resolveLocale', () => {
  const available = ['en', 'fr', 'de'] as const;

  test('exact match is case-insensitive and returns the canonical tag', () => {
    expect(resolveLocale('en', available)).toBe('en');
    expect(resolveLocale('EN', available)).toBe('en');
    expect(resolveLocale('DE', available)).toBe('de');
  });

  test('unavailable locale throws with the available list', () => {
    expect(() => resolveLocale('zh', available)).toThrow(/available: en, fr, de/);
    expect(() => resolveLocale('xx', available)).toThrow();
  });
});

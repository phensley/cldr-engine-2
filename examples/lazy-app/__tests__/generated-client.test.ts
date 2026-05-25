/**
 * Smoke tests of the committed LAZY generated client: the literal
 * per-locale import() map, the preload seam (idempotent, get-before-
 * preload throws), and a regenerable committed file.
 */
import { cldr } from '../src/cldr.gen.js';

describe('generated lazy client (examples/lazy-app)', () => {
  it("get() before preload throws a clear error", () => {
    expect(() => cldr.get('en')).toThrow(/has not been preloaded/);
  });

  it("preload is idempotent and get() resolves after it", async () => {
    await cldr.preload('en');
    await cldr.preload('en');
    expect(cldr.get('en').currency.new('1234.5', 'EUR').format()).toBe('€1,234.50');
    // separate locale still needs its own preload
    expect(() => cldr.get('de')).toThrow(/has not been preloaded/);
    await cldr.preload('de');
    expect(cldr.get('de').currency.new('1234.5', 'EUR').format()).toBe('1.234,50\u00a0€');
  });

  it("is regenerable: committed file matches a fresh generate()", async () => {
    const { readFileSync } = await import('node:fs');
    const { generate } = await import('@phensley/cldr-generate');
    const config = (await import('../cldr.config.js')).default;
    expect(readFileSync(new URL('../src/cldr.gen.ts', import.meta.url), 'utf8')).toBe(generate(config));
  });
});

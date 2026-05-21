/**
 * Client runtime tests: this is the exact composition shape the generator
 * will emit (S2-M3) — bare createCldr + factories + subpath method imports.
 */
import { createCldr, makeCurrencyFactory, makeDecimalFactory } from '../src/index.js';
import { compare } from '@phensley/cldr/decimal/compare';
import { min } from '@phensley/cldr/decimal/min';
import { scientific } from '@phensley/cldr/decimal/format/scientific';
import { format } from '@phensley/cldr/currency/format';
import { symbol } from '@phensley/cldr/currency/symbol';
import { fractionDigits } from '@phensley/cldr/currency/fraction-digits';
import { en } from '@phensley/cldr/packs/en';
import { es419 } from '@phensley/cldr/packs/es419';
import { fr } from '@phensley/cldr/packs/fr';

// mirrors the emitted client: packs may be absent (decimal-only configs)
const build = (pack: Parameters<typeof makeCurrencyFactory>[0] | undefined) => ({
  decimal: makeDecimalFactory({ compare, min, format: { scientific } }),
  currency: makeCurrencyFactory(pack!, { format, symbol, fractionDigits }),
});

describe('createCldr — eager mode', () => {
  const cldr = createCldr({
    lazy: false,
    locales: ['en', 'es-419', 'fr'] as const,
    packs: { en, 'es-419': es419, fr },
    build,
  });

  test('get() is synchronous and resolves features from the locale pack', () => {
    const ctx = cldr.get('en');
    expect(ctx.currency.new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(cldr.get('es-419').currency.new('5', 'MXN').symbol()).toBe('MX$');
    expect(ctx.decimal.new('1.5').format.scientific()).toBe('1.5e+0');
    expect(cldr.get('es-419').currency.new('5', 'MXN').symbol()).toBe('MX$');
    expect(cldr.get('fr').currency.new('1234.5', 'EUR').format()).toBe('1,234.50\u00a0€');
  });

  test('get() is case-insensitive and canonicalizes to the configured tag (runtime)', () => {
    const getAny = (cldr: unknown) => (cldr as { get: (l: string) => unknown }).get;
    expect(getAny(cldr)('EN')).toBe(cldr.get('en'));
    expect(getAny(cldr)('ES-419')).toBe(cldr.get('es-419'));
  });

  test('locale param is narrowed to the configured literal union', () => {
    // compile-time rejection of unconfigured locales (never executed)
    const rejectUnconfigured = () => {
      // @ts-expect-error — 'de' is not configured
      cldr.get('de');
    };
    void rejectUnconfigured;
    const tags: ('en' | 'es-419' | 'fr')[] = ['en', 'fr'];
    expect(cldr.get(tags[0])).toBeDefined();
    void cldr.preload; // eager mode still exposes the seam (no-op)
  });

  test('unconfigured locale fails loudly at runtime with the available list', () => {
    expect(() => (cldr as unknown as { get: (l: string) => unknown }).get('de')).toThrow(/available: en, es-419, fr/);
  });

  test('contexts are cached per locale', () => {
    expect(cldr.get('en')).toBe(cldr.get('en'));
  });

  test('instances are isolated: decode + build repeat per client, contexts never shared', () => {
    // the cache-lifetime contract (plans/prototype-plan.md §12): caches are
    // per-client and die with the instance — no implicit global cache.
    let builds = 0;
    const makeClient = () =>
      createCldr({
        lazy: false,
        locales: ['en'] as const,
        packs: { en },
        build: (pack) => {
          builds++;
          return { currency: makeCurrencyFactory(pack!, { format, symbol, fractionDigits }) };
        },
      });
    const a = makeClient();
    const b = makeClient();
    expect(builds).toBe(0); // nothing built until first get()
    const ctxA = a.get('en');
    expect(builds).toBe(1);
    const ctxB = b.get('en');
    expect(builds).toBe(2); // a fresh client pays its own decode + build
    expect(ctxA).not.toBe(ctxB); // no cross-instance context sharing
    expect(ctxA.currency.new('1', 'USD').format()).toBe('$1.00');
    expect(a.get('en')).toBe(ctxA); // per-client identity still holds
  });
});

describe('createCldr — lazy mode', () => {
  test("get() before preload throws a clear error; preload is idempotent", async () => {
    let loads = 0;
    const cldr = createCldr({
      lazy: true,
      locales: ['en', 'fr'] as const,
      packs: {
        en: () => {
          loads++;
          return import('@phensley/cldr/packs/en').then((m) => m.en);
        },
        fr: () => import('@phensley/cldr/packs/fr').then((m) => m.fr),
      },
      build,
    });

    expect(() => cldr.get('en')).toThrow(/has not been preloaded/);

    await cldr.preload('en');
    await cldr.preload('en'); // idempotent — loader runs once
    expect(loads).toBe(1);

    const ctx = cldr.get('en');
    expect(ctx.decimal.new('2').min('1.5').compare('1.6')).toBe(-1);
    expect(ctx.currency.new('1', 'USD').format()).toBe('$1.00');

    // other locale still untouched until its own preload
    expect(() => cldr.get('fr')).toThrow(/has not been preloaded/);
  });

  test('preload is a no-op in eager mode', async () => {
    const cldr = createCldr({ lazy: false, locales: ['en'] as const, packs: { en }, build });
    await cldr.preload('en');
    expect(cldr.get('en').decimal.new('1').compare('1')).toBe(0);
  });

  test('preload state is per-client — one instance loading does not unlock another', async () => {
    const mk = () => createCldr({ lazy: true, locales: ['en'] as const, packs: { en: () => import('@phensley/cldr/packs/en').then((m) => m.en) }, build });
    const a = mk();
    const b = mk();
    await a.preload('en');
    expect(a.get('en')).toBeDefined();
    expect(() => b.get('en')).toThrow(/has not been preloaded/);
  });
});

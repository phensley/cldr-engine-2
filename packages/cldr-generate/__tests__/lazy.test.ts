/**
 * Lazy-mode emission tests: the generated client uses a literal import()
 * per known locale (bundler code-splitting primitive, never an
 * interpolated specifier), and every locale the runtime ships is mapped.
 */
import { generate } from '../src/index.js';

const code = generate({
  locales: { lazy: true },
  features: { currency: true, decimal: { min: true, format: { scientific: true } } },
});

describe('generate — lazy client', () => {
  test('maps EVERY manifest locale via literal import() loaders', () => {
    // family variants (en family) load their DELTA modules; the rest load full packs
    for (const [tag, id, delta] of [
      ['ar', 'ar', false],
      ['de', 'de', false],
      ['en', 'en', true],
      ['en-001', 'en001', false],
      ['en-AU', 'enAU', true],
      ['en-CA', 'enCA', true],
      ['en-GB', 'enGB', true],
      ['fr', 'fr', false],
      ['hi', 'hi', false],
      ['ru', 'ru', false],
      ['zh', 'zh', false],
    ] as const) {
      const module = `@phensley/cldr/packs/${delta ? 'delta/' : ''}${id}`;
      expect(code).toContain(`import('${module}')`);
      expect(code).toContain(`.then((m) => m.${id})`);
      void tag;
      void delta;
    }
  });

  test('never interpolates a runtime-computed specifier', () => {
    // the whole static-specifier contract: no template literals in import()
    expect(code.match(/import\(`/)).toBeNull();
    expect(code.match(/import\('\$\{/)).toBeNull();
  });

  test('locales list covers all packs + lazy flag is set', () => {
    expect(code).toContain('lazy: true');
    expect(code).toContain('locales: ["ar","de","en","en-001","en-AU","en-CA","en-GB","fr","hi","ru","zh"] as const');
  });

  test('no static pack imports in lazy mode', () => {
    expect(code.match(/^import \{[^}]+\} from '@phensley\/cldr\/packs\//m)).toBeNull();
  });

  test('widened client: get/preload accept any string; unknown tags throw at runtime', () => {
    expect(code).toContain('export const cldr: Cldr<string, ReturnType<typeof build>> = {');
    expect(code).toContain('client.get(locale as "ar" | "de" | "en" | "en-001" | "en-AU" | "en-CA" | "en-GB" | "fr" | "hi" | "ru" | "zh")');
  });
});

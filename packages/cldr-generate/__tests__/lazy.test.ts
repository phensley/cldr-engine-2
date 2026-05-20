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
    for (const [tag, id] of [['en', 'en'], ['fr', 'fr'], ['de', 'de'], ['es-419', 'es419']] as const) {
      expect(code).toContain(`import('@phensley/cldr/packs/${id}')`);
      expect(code).toContain(`.then((m) => m.${id})`);
      void tag;
    }
  });

  test('never interpolates a runtime-computed specifier', () => {
    // the whole static-specifier contract: no template literals in import()
    expect(code.match(/import\(`/)).toBeNull();
    expect(code.match(/import\('\$\{/)).toBeNull();
  });

  test('locales list covers all packs + lazy flag is set', () => {
    expect(code).toContain('lazy: true');
    expect(code).toContain('locales: ["de","en","es-419","fr"] as const');
  });

  test('no static pack imports in lazy mode', () => {
    expect(code.match(/^import \{[^}]+\} from '@phensley\/cldr\/packs\//m)).toBeNull();
  });

  test('widened client: get/preload accept any string; unknown tags throw at runtime', () => {
    expect(code).toContain('export const cldr: Cldr<string, ReturnType<typeof build>> = {');
    expect(code).toContain('client.get(locale as "de" | "en" | "es-419" | "fr")');
  });
});

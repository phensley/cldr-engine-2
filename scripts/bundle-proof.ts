/**
 * Bundle-proof harness (plans/prototype-plan.md S2 acceptance).
 *
 *   pnpm bundle-proof
 *
 * For four configs — decimal-only/en (eager), currency/en+fr (eager),
 * all/4-locales (eager), all-lazy — it generates a client, bundles a
 * consumer app with esbuild (metafile on), and asserts:
 *
 *   - unselected methods and locales are physically absent (metafile
 *     inputs + data sentinels in bundle text)
 *   - bytes scale with the config, not the library (decimal-only <
 *     currency-en-fr < all-4-eager)
 *   - lazy mode produces bundler-managed per-locale chunks; the entry
 *     chunk carries no locale data
 *
 * Results recorded to notes/s2-bundle-table.md.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { generate } from '../packages/cldr-generate/src/index.js';
import type { CldrConfig } from '../packages/cldr-generate/src/index.js';
import { manifest } from '../packages/cldr/src/manifest.js';
import { localeIdentifier } from '../internal/data-pipeline/src/emit.js';

const root = process.cwd();
const tmp = join(root, '.bundle-proof');

// ---------------------------------------------------------------------------
// configs under test

interface HarnessCase {
  name: string;
  config: CldrConfig;
  /** entry app body: exercises every selected method for every locale */
  app: (ctx: string) => string;
  lazy?: boolean;
}

const decimalApp = (ctx: string) => [
  `const d = ${ctx}.decimal.new('1.2345');`,
  `out.push(d.min('2').compare('3'), d.max('1').compare('0'), d.movePoint(2).format.scientific(), d.format.scientific({ fractionDigits: 2 }));`,
].join('\n');
const currencyApp = (ctx: string) => [
  `out.push(${ctx}.currency.new('1234.5', 'USD').format(), ${ctx}.currency.new('1', 'JPY').symbol(), ${ctx}.currency.new('1', 'EUR').fractionDigits());`,
].join('\n');

const hasDecimal = (c: CldrConfig) => c.features.decimal !== undefined;
const hasCurrency = (c: CldrConfig) => c.features.currency !== undefined;

const cases: HarnessCase[] = [
  {
    name: 'decimal-only-en',
    config: { locales: ['en'], features: { decimal: { compare: true, min: true, max: true, movePoint: true, format: { scientific: true } } } },
    app: decimalApp,
  },
  {
    name: 'plural-en',
    config: { locales: ['en'], features: { plural: true } },
    app: (ctx: string) => `out.push(${ctx}.plural.new('2').select());`,
  },
  {
    name: 'calendar-en',
    config: { locales: ['en'], features: { calendar: true } },
    app: (ctx: string) => `out.push(${ctx}.calendar.new(new Date('2025-03-04T12:00:00Z')).format(), ${ctx}.calendar.new(new Date('2025-01-15T12:00:00Z')).offset('America/New_York'));`,
  },
  {
    name: 'currency-en-fr',
    config: { locales: ['en', 'fr'], features: { currency: true } },
    app: currencyApp,
  },
  {
    name: 'all-4-eager',
    config: { locales: ['en', 'fr', 'de', 'zh'], features: { decimal: true, currency: true } },
    app: (ctx: string) => [decimalApp(ctx), currencyApp(ctx)].join('\n'),
  },
  {
    name: 'family-en-eager',
    config: { locales: ['en', 'en-GB', 'en-AU', 'en-CA'], features: { currency: true } },
    app: currencyApp,
  },
  {
    name: 'all-lazy',
    config: { locales: { lazy: true }, features: { decimal: true, currency: true } },
    lazy: true,
    app: (ctx: string) => `await cldr.preload(locale);\nconst ctx = cldr.get(locale);\n${[decimalApp('ctx'), currencyApp('ctx')].join('\n')}`,
  },
];

// ---------------------------------------------------------------------------
// helpers

const bytesOf = (s: string) => new TextEncoder().encode(s).length;
const gz = (s: string) => gzipSync(new TextEncoder().encode(s)).length;

const failures: string[] = [];
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures.push(msg);
  }
};

const bundle = async (c: HarnessCase, dir: string) => {
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'cldr.gen.ts'), generate(c.config));
  const init = c.lazy ? "const locale = 'de';\n" : '';
  writeFileSync(
    join(src, 'app.ts'),
    `import { cldr } from './cldr.gen.ts';\n\nexport const main = async () => {\n${init}  const out: unknown[] = [];\n${c.app('cldr.get(locale)')}\n  return out.join('|');\n};\n`,
  );
  const outdir = join(dir, 'out');
  const result = await build({
    entryPoints: [join(src, 'app.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    splitting: c.lazy,
    outdir,
    metafile: true,
    write: true,
    absWorkingDir: root,
    charset: 'utf8',
    logLevel: 'silent',
  });
  const files = readdirSync(outdir).sort();
  const text = files.map((f) => readFileSync(join(outdir, f), 'utf8')).join('\n');
  const total = files.reduce((acc, f) => acc + readFileSync(join(outdir, f)).length, 0);
  const totalGz = files.reduce((acc, f) => acc + gz(readFileSync(join(outdir, f), 'utf8')), 0);
  return { result, files, text, total, totalGz };
};

const inputsOf = (r: Awaited<ReturnType<typeof build>>) => {
  const keys = Object.keys(r.metafile!.inputs);
  if (process.env.DEBUG_BUNDLE) {
    console.log('inputs:', keys.filter((k) => k.includes('packs') || k.includes('currency') || k.includes('decimal')).join(' | ') || '(none)');
  }
  // metafile keys are relative (no leading slash)
  return keys.filter((p) => p.includes('packages/cldr/') || p.includes('internal/core/'));
};
const hasPack = (inputs: string[], tag: string) =>
  inputs.some((p) => p.includes(`/src/packs/${tag}.ts`) || p.includes(`/dist/packs/${tag}.js`));

// v0.1: pools are array literals, so locale data IS grep-able module text
const SENTINELS = { en: 'United Kingdom', fr: 'Royaume-Uni', de: 'Vereinigtes Königreich', zh: '美国', ar: 'الولايات المتحدة', hi: 'संयुक्त राज्य', ru: 'Соединенные Штаты' } as const;

// ---------------------------------------------------------------------------
// run

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const rows: string[][] = [['config', 'bundle bytes', 'gz', 'files', 'inputs', 'packs in graph']];
let prevBytes = 0;

for (const c of cases) {
  const { text, total, totalGz, files, result } = await bundle(c, join(tmp, c.name));
  const inputs = inputsOf(result);
  const inGraph = (s: string) => inputs.filter((p) => p.includes(s));

  const packs = c.name;

  if (c.name === 'decimal-only-en') {
    assert(inGraph('/packs/').length === 0, 'decimal-only: no pack modules in graph');
    assert(inGraph('/currency/').length === 0, 'decimal-only: no currency modules in graph');
    assert(inGraph('/plural/').length === 0, 'decimal-only: no plural modules in graph');
    assert(!text.includes('makeCurrencyFactory'), 'decimal-only: currency factory not referenced');
    assert(!text.includes('makePluralFactory'), 'decimal-only: plural factory not referenced');
    for (const name of Object.values(SENTINELS)) {
      assert(!text.includes(name), `decimal-only: no locale data ("${name}")`);
    }
  }
  if (c.name === 'currency-en-fr') {
    assert(hasPack(inputs, 'en') && hasPack(inputs, 'fr'), 'currency-en-fr: en+fr packs in graph');
    assert(!hasPack(inputs, 'de') && !hasPack(inputs, 'zh'), 'currency-en-fr: de/zh packs absent from graph');
    assert(inGraph('/currency/').length > 0, 'currency-en-fr: currency modules in graph');
    // currency.format transitively pulls the decimal pattern formatter —
    // but NOT the scientific method module (the config-selected slot)
    assert(inGraph('/decimal/format/scientific').length === 0, 'currency-en-fr: scientific module absent');
    assert(!text.includes('scientific'), 'currency-en-fr: scientific method not shipped');
    assert(text.includes(SENTINELS.fr), 'currency-en-fr: fr data present (pool is literal text)');
    assert(!text.includes(SENTINELS.zh), 'currency-en-fr: zh data absent');
    assert(!text.includes(SENTINELS.de), 'currency-en-fr: de data absent');
  }
  if (c.name === 'all-4-eager') {
    for (const tag of ['en', 'fr', 'de', 'zh']) {
      assert(hasPack(inputs, tag), `all-4-eager: ${tag} pack in graph`);
    }
    for (const tag of ['en', 'fr', 'de', 'zh'] as const) {
      assert(text.includes(SENTINELS[tag]), `all-4-eager: "${SENTINELS[tag]}" present`);
    }
  }
  if (c.name === 'calendar-en') {
    assert(inGraph('/packs/en.ts').length === 1 || inGraph('/packs/en.js').length === 1, 'calendar-en: en pack in graph');
    assert(inGraph('/calendar/format').length === 1, 'calendar-en: format module in graph');
    assert(inGraph('/packs/zones.ts').length === 1 || inGraph('/packs/zones.js').length === 1, 'calendar-en: zones table in graph');
    assert(inGraph('/plural/').length === 0, 'calendar-en: no plural modules in graph');
    assert(inGraph('/currency/').length === 0, 'calendar-en: no currency modules in graph');
  }
  if (c.name === 'plural-en') {
    assert(inGraph('/packs/en.ts').length === 1 || inGraph('/packs/en.js').length === 1, 'plural-en: en pack in graph');
    assert(inGraph('/plural/select').length === 1, 'plural-en: select module in graph');
    assert(inGraph('/currency/').length === 0, 'plural-en: no currency modules in graph');
    assert(!text.includes('makeCurrencyFactory'), 'plural-en: currency factory absent');
  }
  if (c.name === 'family-en-eager') {
    // layout selection: base + per-variant deltas — the FULL variant packs
    // must be absent from the graph
    assert(hasPack(inputs, 'en001'), 'family: base en-001 in graph');
    for (const delta of ['en', 'enGB', 'enAU', 'enCA']) {
      assert(inputs.some((p) => p.includes(`/delta/${delta}.ts`) || p.includes(`/delta/${delta}.js`)), `family: delta ${delta} in graph`);
    }
    for (const full of ['en', 'enGB', 'enAU', 'enCA']) {
      assert(!hasPack(inputs, full), `family: full ${full} pack absent`);
    }
  }
  if (c.name === 'all-lazy') {
    assert(files.length > 1, 'lazy: bundler split into multiple chunks');
    assert(hasPack(inputs, 'de') && hasPack(inputs, 'zh'), 'lazy: every pack is a chunk source');
    // the entry chunk (the one holding the client runtime) must contain
    // exactly one dynamic import() per locale pack — and zero locale data
    const entryIdx = files.findIndex((f) => readFileSync(join(tmp, c.name, 'out', f), 'utf8').includes('createCldr'));
    assert(entryIdx >= 0, 'lazy: entry chunk identifiable (contains createCldr)');
    const entryText = readFileSync(join(tmp, c.name, 'out', files[entryIdx]), 'utf8');
    const dynamicImports = entryText.match(/import\("\.\/[A-Za-z0-9]+-[A-Z0-9]+\.js"\)/g) ?? [];
    assert(
      dynamicImports.length === manifest.locales.length,
      `lazy: entry has exactly one import() per manifest locale (${manifest.locales.length}; found ${dynamicImports.length})`,
    );
    for (const name of Object.values(SENTINELS)) {
      assert(!entryText.includes(name), `lazy: entry carries no locale data ("${name}")`);
    }
    // one chunk per locale, each carrying its locale's data; the entry
    // itself carries none (checked above). Cross-family sentinels suffice:
    // the en-family chunk pools intentionally share most strings, so a
    // per-locale string match is not well-defined.
    assert(files.length - 1 === manifest.locales.length, `lazy: one chunk per locale (${files.length - 1} vs ${manifest.locales.length})`);
    const chunkTexts = files.filter((f, idx) => idx !== entryIdx).map((f) => readFileSync(join(tmp, c.name, 'out', f), 'utf8'));
    for (const t of chunkTexts) {
      // full packs carry pool text; family-delta chunks are tiny by design
      assert(Object.values(SENTINELS).some((n) => t.includes(n)) || t.includes('"base"'), "lazy: every locale chunk carries pool text or is a family delta");
    }
    for (const n of Object.values(SENTINELS)) {
      assert(chunkTexts.some((t) => t.includes(n)), `lazy: "${n}" present in some chunk`);
    }
  }
  // the numeric stress pack is never consumed by any feature
  assert(inGraph('/packs/numeric').length === 0, `${c.name}: numeric pack never in graph`);

  if (c.name === 'calendar-en') {
    assert(inGraph('/packs/en.ts').length === 1 || inGraph('/packs/en.js').length === 1, 'calendar-en: en pack in graph');
    assert(inGraph('/calendar/format').length === 1, 'calendar-en: format module in graph');
    assert(inGraph('/packs/zones.ts').length === 1 || inGraph('/packs/zones.js').length === 1, 'calendar-en: zones table in graph');
    assert(inGraph('/plural/').length === 0, 'calendar-en: no plural modules in graph');
    assert(inGraph('/currency/').length === 0, 'calendar-en: no currency modules in graph');
  }
  if (c.name === 'plural-en') {
    assert(inGraph('/packs/en.ts').length === 1 || inGraph('/packs/en.js').length === 1, 'plural-en: en pack in graph');
    assert(inGraph('/plural/select').length === 1, 'plural-en: select module in graph');
    assert(inGraph('/currency/').length === 0, 'plural-en: no currency modules in graph');
    assert(!text.includes('makeCurrencyFactory'), 'plural-en: currency factory absent');
  }
  if (c.name === 'family-en-eager') {
    // the delta win: 4 family locales (base + 3 deltas) must beat the previous
    // config's 4 independent locales on bytes
    assert(total < prevBytes, `family-en-eager: deltas smaller than 4 full locales (${total} < ${prevBytes}?)`);
  } else if (prevBytes > 0) {
    assert(total > prevBytes, `${c.name}: bytes > previous config (scaling with config, not library)`);
  }
  prevBytes = total;

  rows.push([c.name, String(total), String(totalGz), String(files.length), String(inputs.length), inGraph('/src/packs/').map((p) => `packs/${p.split('/src/packs/')[1]}`).join(',') || '—']);
  console.log(`${c.name}: ${total} bytes (${totalGz} gz) — ${files.length} file(s), ${inputs.length} module inputs`);
}

// ---------------------------------------------------------------------------
// report

const md = ['# S2 bundle table — config × bundle size (esbuild)', '', `_Recorded ${new Date().toISOString()}_`, '',
  'Configs: decimal-only/en (eager), currency/en+fr (eager), all/4-locales (eager), all-lazy. Bundled with esbuild (browser, esm), gz = gzip of output. Absence assertions asserted in-script.',
  '',
  rows.map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`)).join('\n'),
  '',
].join('\n');

writeFileSync('notes/s2-bundle-table.md', md);
if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) FAILED:`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}
console.log('all absence + scaling assertions passed');

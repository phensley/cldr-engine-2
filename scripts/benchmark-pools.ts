/**
 * Pool-encoding re-baseline + real-data pack structure measurements:
 *
 *   pnpm benchmark:pools
 *
 * Section 1 — pool transport (mono-locale): how a single pool ships in a
 * module (JSON array literal vs literal string + u16 offsets vs the old
 * X85 chain), raw + gzip. Section 2 — decode time for the real
 * transports. Section 3 — MULTI-LOCALE STRUCTURES (the real-data pack
 * design gates, plans/real-data-pack-design.md): for an English-family
 * scenario and a cross-family scenario, compares
 *
 *   literal-each  — per-locale literal pools (current v0.1)
 *   pairs         — 1.x-style (fieldIdx, valueIdx) base-36 pairs
 *   base-delta    — base pool + per-variant X85 bitmask + compacted
 *                   override values
 *   shared-full   — config-global pool + per-locale u16 index arrays
 *                   (GVE16/X85)
 *   shared-delta  — global pool + base index array + per-variant mask +
 *                   compacted override indices
 *
 * each as module text bytes (raw = in-cache cost), gz-concatenated
 * (eager single bundle), and gz-per-module (lazy chunks). Section 4 —
 * numeric tables: full u16 vs delta-encoded. Results recorded to
 * notes/pool-rebaseline.md.
 */
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { decodeX85, decodeX85GVE16, encodeGVE16, encodeX85, packU16, toU16 } from '../internal/data-pipeline/src/index.js';

// ---------------------------------------------------------------------------
// deterministic, representative name pools

const rand = (seed: number) => {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
};

const ASCII = 'abcdefghijklmnopqrstuvwxyz';
const PREFIXES = ['Saint ', 'North ', 'Upper ', 'Lower ', 'República de ', 'Província de ', 'Ville de ', 'Contea di ', 'Neu-', '%', ''];
const SUFFIXES = ['Island', 'Region', 'Province', 'County', 'Plateau', 'Peninsula', 'Oblast', 'Voivodeship', 'Ivoire', ''];
const ACCENTS = ['é', 'ü', 'ñ', 'ø', 'å', 'ć', 'đ', 'İ', 'ş', 'ž'];
const HEAVY = ['中国', '日本', '東京', '한국', 'Москва', 'Αθήνα', 'Екатеринбург', 'Вьетнам', 'Česká', 'Ελλάδα'];

interface PoolOpts {
  accentRatio: number;
  heavyRatio: number;
  escapeRatio: number;
}

const makePool = (count: number, opts: PoolOpts, seed: number): string[] => {
  const gen = rand(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let name = '';
    if (gen() < 0.25) {
      name += PREFIXES[Math.floor(gen() * PREFIXES.length)];
    }
    const len = 5 + Math.floor(gen() * 5);
    for (let j = 0; j < len; j++) {
      name += ASCII[Math.floor(gen() * ASCII.length)];
    }
    const r = gen();
    if (r < opts.accentRatio) {
      name = name.slice(0, 3) + ACCENTS[Math.floor(gen() * ACCENTS.length)] + name.slice(4);
    } else if (r < opts.accentRatio + opts.heavyRatio) {
      name = name.slice(0, 2) + HEAVY[Math.floor(gen() * HEAVY.length)] + name.slice(4);
    }
    if (gen() < 0.3) {
      name += SUFFIXES[Math.floor(gen() * SUFFIXES.length)];
    }
    if (gen() < opts.escapeRatio) {
      name += gen() < 0.5 ? '"' : '\\';
    }
    out.push(name);
  }
  return out;
};

const unique = (arr: string[]): string[] => [...new Set(arr)];
const bytesOf = (s: string) => new TextEncoder().encode(s).length;
const gz = (s: string) => gzipSync(new TextEncoder().encode(s)).length;
const gzSum = (mods: string[]) => mods.reduce((acc, m) => acc + gz(m), 0);
const rawSum = (mods: string[]) => mods.reduce((acc, m) => acc + bytesOf(m), 0);

const time = (fn: () => void, minMs = 150): number => {
  fn();
  let n = 0;
  let elapsed = 0;
  do {
    const t0 = performance.now();
    fn();
    elapsed += performance.now() - t0;
    n++;
  } while (elapsed < minMs);
  return elapsed / n;
};

// ---------------------------------------------------------------------------
// Section 1+2: mono-locale pool transport (the S1 re-baseline)

const makePoolAll = (count: number, opts: PoolOpts, seed: number): string[] => makePool(count, opts, seed);

const POOLS: Array<[string, string[]]> = [
  ['A (2.5 KB, 250)', makePoolAll(250, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.01 }, 1)],
  ['B (30 KB, 3k)', makePoolAll(3000, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.003 }, 2)],
  ['C (800 KB, 25k)', makePoolAll(25000, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.003 }, 3)],
  ['D (150 KB, 5k, CJK/Cyrillic)', makePoolAll(5000, { accentRatio: 0.15, heavyRatio: 0.55, escapeRatio: 0.003 }, 4)],
];

/** The v0 chain transport, self-contained (the pipeline no longer ships it). */
interface ChainSegment {
  offsets: string;
  data: string;
}
const encodeChainPool = (strings: string[], maxBytes: number): ChainSegment[] => {
  const out: ChainSegment[] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const s of strings) {
    const b = new TextEncoder().encode(s).length;
    if (current.length > 0 && bytes + b > maxBytes) {
      out.push(encodeChainSegment(current));
      current = [];
      bytes = 0;
    }
    current.push(s);
    bytes += b;
  }
  out.push(encodeChainSegment(current));
  return out;
};
const encodeChainSegment = (strings: string[]): ChainSegment => {
  const byteArr: number[] = [];
  const offsets: number[] = [];
  for (const s of strings) {
    offsets.push(byteArr.length);
    for (const c of new TextEncoder().encode(s)) {
      byteArr.push(c);
    }
  }
  offsets.push(byteArr.length);
  return { offsets: encodeX85(encodeGVE16(toU16(offsets))), data: encodeX85(new Uint8Array(byteArr)) };
};
const decodeChainPool = (segments: ChainSegment[]): string[] => {
  const out: string[] = [];
  const utf8 = new TextDecoder('utf-8');
  for (const seg of segments) {
    const offsets = Array.from(decodeX85GVE16(seg.offsets));
    const bytes = decodeX85(seg.data);
    for (let i = 0; i < offsets.length - 1; i++) {
      out.push(utf8.decode(bytes.subarray(offsets[i], offsets[i + 1])));
    }
  }
  return out;
};

const segmentLiteral = (strings: string[], maxUnits: number): Array<{ offsets: string; data: string }> => {
  const segments: Array<{ offsets: string; data: string }> = [];
  let current: string[] = [];
  let units = 0;
  for (const s of strings) {
    const u = s.length;
    if (current.length > 0 && units + u > maxUnits) {
      segments.push({ offsets: packU16(accOffsets(current)), data: current.join('') });
      current = [];
      units = 0;
    }
    current.push(s);
    units += u;
  }
  segments.push({ offsets: packU16(accOffsets(current)), data: current.join('') });
  return segments;
};

const accOffsets = (strings: string[]): number[] => {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of strings) {
    offsets.push(acc);
    acc += s.length;
  }
  offsets.push(acc);
  return offsets;
};

const decodeLiteral = (segments: Array<{ offsets: string; data: string }>) => {
  const out: string[] = [];
  for (const seg of segments) {
    const offsets = Array.from(decodeX85GVE16(seg.offsets));
    const data = seg.data;
    for (let i = 0; i < offsets.length - 1; i++) {
      out.push(data.slice(offsets[i], offsets[i + 1]));
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Section 3: multi-locale structures

/** Fixed field count per locale (names-only pack ≈ 2k fields). */
const F = 2000;

/** Bitmask over field positions where a variant differs from base (X85 bytes). */
const mask = (fields: string[], baseFields: string[]): string => {
  const bytes = new Uint8Array(Math.ceil(F / 8));
  for (let i = 0; i < F; i++) {
    if (fields[i] !== baseFields[i]) {
      bytes[i >> 3] |= 1 << (i & 7);
    }
  }
  return encodeX85(bytes);
};

/** Per-locale pool + index arrays for the shared-pool structures. */
const indexArray = (fields: string[], pool: string[]): string => packU16(fields.map((v) => pool.indexOf(v)));

/** 1.x-style (fieldIdx, valueIdx) pairs, base-36 space-joined. */
const pairText = (fields: string[], baseFields: string[], exceptionPool: string[]): string => {
  const parts: string[] = [];
  for (let i = 0; i < F; i++) {
    if (fields[i] !== baseFields[i]) {
      parts.push(`${i.toString(36)} ${exceptionPool.indexOf(fields[i]).toString(36)}`);
    }
  }
  return `"${parts.join(' ')}"`;
};

interface StructureResult {
  name: string;
  raw: number;
  gzConcat: number;
  gzPerModule: number;
  modules: number;
  note: string;
}

const measureModules = (name: string, modules: string[], note = ''): StructureResult => ({
  name,
  raw: rawSum(modules),
  gzConcat: gz(modules.join('\n')),
  gzPerModule: gzSum(modules),
  modules: modules.length,
  note,
});

/**
 * Scenario A: one family (en-001 base + 4 regional variants, override
 * ratios 0.5% / 1.5% / 4%). Override values drawn from a shared variant
 * universe (regional agreements; e.g. en-US and en-CA often coincide).
 */
const scenarioA = (): { label: string; rows: StructureResult[] } => {
  const sharedBase = makePool(600, { accentRatio: 0.1, heavyRatio: 0, escapeRatio: 0.002 }, 11);
  const perLocale = makePool(F - 600, { accentRatio: 0.05, heavyRatio: 0, escapeRatio: 0.001 }, 12);
  const variantUniverse = makePool(500, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.002 }, 13);
  const baseFields = [...sharedBase, ...perLocale];

  const ratios = [0.005, 0.015, 0.04, 0.2];
  const variants = ratios.map((r, k) => {
    const gen = rand(20 + k);
    const fields = [...baseFields];
    const count = Math.round(F * r);
    const idxs = new Set<number>();
    while (idxs.size < count) {
      idxs.add(Math.floor(gen() * F));
    }
    for (const i of idxs) {
      fields[i] = variantUniverse[Math.floor(gen() * variantUniverse.length)];
    }
    return fields;
  });

  const basePool = unique(baseFields);
  const allFields = [baseFields, ...variants];
  const sharedPool = unique(allFields.flat());
  const exceptions = unique(variants.flatMap((f) => f.filter((v, i) => v !== baseFields[i])));

  const rows: StructureResult[] = [
    measureModules(
      'literal-each (v0.1)',
      [basePool, ...variants.map(unique)].map((p) => JSON.stringify(p)),
      'per-locale literal pools',
    ),
    measureModules(
      'pairs (1.x-style)',
      [JSON.stringify(basePool), JSON.stringify(exceptions), ...variants.map((f) => pairText(f, baseFields, exceptions))],
      'layer exceptions pool + base-36 (fieldIdx, valueIdx) maps',
    ),
    measureModules(
      'base-delta',
      [
        JSON.stringify(basePool),
        JSON.stringify(exceptions),
        ...variants.map((f) => {
          const over = unique(f.filter((v, i) => v !== baseFields[i]));
          // mask + compacted override indices into the layer exceptions pool
          return JSON.stringify({ m: mask(f, baseFields), v: packU16(over.map((v) => exceptions.indexOf(v))) });
        }),
      ],
      'layer exceptions pool + X85 mask + override indices',
    ),
    measureModules(
      'shared-full',
      [JSON.stringify(sharedPool), ...allFields.map((f) => indexArray(f, sharedPool))],
      'global pool + u16 index arrays',
    ),
    measureModules(
      'shared-delta',
      [
        JSON.stringify(sharedPool),
        indexArray(baseFields, sharedPool),
        ...variants.map((f) => {
          const over = unique(f.filter((v, i) => v !== baseFields[i]));
          return JSON.stringify({ m: mask(f, baseFields), v: packU16(over.map((v) => sharedPool.indexOf(v))) });
        }),
      ],
      'global pool + base index + mask + override indices',
    ),
  ];
  return {
    label: `A: en family — ${F} fields, 5 locales, overrides ${ratios.join(' / ')}`,
    rows,
  };
};

/**
 * Scenario B: cross-family (en + fr + de). Locales share ~15% of field
 * values (currency symbols, common names) — the shared-pool win.
 */
const scenarioB = (): { label: string; rows: StructureResult[] } => {
  const enBase = makePool(600, { accentRatio: 0.1, heavyRatio: 0, escapeRatio: 0.002 }, 31);
  const enPer = makePool(F - 600, { accentRatio: 0.05, heavyRatio: 0, escapeRatio: 0.001 }, 32);
  const frUniverse = makePool(1900, { accentRatio: 0.2, heavyRatio: 0, escapeRatio: 0.001 }, 33);
  const deUniverse = makePool(1900, { accentRatio: 0.15, heavyRatio: 0, escapeRatio: 0.001 }, 34);
  const enFields = [...enBase, ...enPer];
  const fieldsFor = (univ: string[], seed: number): string[] => {
    const gen = rand(seed);
    return enFields.map((v) => (gen() < 0.15 ? v : univ[Math.floor(gen() * univ.length)]));
  };
  const frFields = fieldsFor(frUniverse, 41);
  const deFields = fieldsFor(deUniverse, 42);
  const allFields = [enFields, frFields, deFields];
  const sharedPool = unique(allFields.flat());

  const rows: StructureResult[] = [
    measureModules('literal-each (v0.1)', allFields.map(unique).map((p) => JSON.stringify(p)), '3 per-locale literal pools'),
    measureModules('shared-full', [JSON.stringify(sharedPool), ...allFields.map((f) => indexArray(f, sharedPool))], 'global pool + u16 index arrays'),
  ];
  return { label: `B: cross-family en/fr/de — ${F} fields, 15% shared values`, rows };
};

// ---------------------------------------------------------------------------
// Section 4: numeric tables, full vs delta

const scenarioNumeric = (): { label: string; rows: StructureResult[] } => {
  // base table: 300 entries, mix of 0 / ±1 / small / medium; variant
  // differs in 20 entries by ±1..±3
  const gen = rand(50);
  const base: number[] = [];
  for (let i = 0; i < 300; i++) {
    const r = gen();
    base.push(r < 0.6 ? 0 : r < 0.85 ? (gen() < 0.5 ? 1 : -1) : r < 0.95 ? Math.floor(gen() * 8) + 2 : Math.floor(gen() * 990) + 10);
  }
  const variant = [...base];
  const idxs = new Set<number>();
  while (idxs.size < 20) {
    idxs.add(Math.floor(gen() * 300));
  }
  for (const i of idxs) {
    variant[i] += Math.floor(gen() * 6) - 2;
  }
  const bias = (arr: number[], b: number) => packU16(arr.map((n) => n + b));
  // delta table: (variant - base) biased +100 → mostly 1-byte varints
  const deltas = variant.map((v, i) => v - base[i] + 100);

  const rows: StructureResult[] = [
    measureModules('numeric full (u16 each)', [bias(base, 1000), bias(variant, 1000)].map((s) => JSON.stringify(s)), 'both locales as absolute u16 tables'),
    measureModules('numeric delta (u16 biased)', [bias(base, 1000), packU16(deltas)].map((s) => JSON.stringify(s)), 'base + delta-from-base array'),
  ];
  return { label: 'C: numeric table — 300 entries, 20 diffs (±1..±3)', rows };
};

// ---------------------------------------------------------------------------
// run + record

const { rows: rowsA, label: labelA } = scenarioA();
const { rows: rowsB, label: labelB } = scenarioB();
const { rows: rowsC, label: labelC } = scenarioNumeric();

const structureTables = (label: string, rows: StructureResult[]) => [
  `### ${label}`,
  '',
  [
    ['structure', 'raw module bytes (cache)', 'gz concat (eager)', 'gz per-module (lazy)', 'modules', 'note'],
    ...rows.map((r) => [r.name, String(r.raw), String(r.gzConcat), String(r.gzPerModule), String(r.modules), r.note]),
  ]
    .map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`))
    .join('\n'),
  '',
];

// mono-locale transport rows (section 1)
const transportRows: string[][] = [['pool', 'candidate', 'module bytes', 'gz bytes', 'gz vs literal', 'segments']];
for (const [label, strings] of POOLS) {
  const jsonText = JSON.stringify(strings);
  const literalSegs = segmentLiteral(strings, 65535);
  const chainSegs = { segments: encodeChainPool(strings, 65535) };
  const literalSegsText = JSON.stringify({ codec: 'literal', segments: literalSegs });
  const chainText = JSON.stringify(chainSegs);
  const j = { b: bytesOf(jsonText), g: gz(jsonText) };
  const l = { b: bytesOf(literalSegsText), g: gz(literalSegsText) };
  const c = { b: bytesOf(chainText), g: gz(chainText) };
  transportRows.push(
    [label, 'json (array literal)', String(j.b), String(j.g), `${((j.g / l.g) * 100).toFixed(0)}%`, '—'],
    [label, 'literal (+u16 unit offsets)', String(l.b), String(l.g), '100%', String(literalSegs.length)],
    [label, 'chain (X85 utf8 + byte offsets)', String(c.b), String(c.g), `${((c.g / l.g) * 100).toFixed(0)}%`, String(chainSegs.segments.length)],
  );
}

// decode perf (section 2)
const perf: string[][] = [['pool', 'chain decode (us/op)', 'literal decode (us/op)', 'ratio']];
for (const [label, strings] of POOLS) {
  if (bytesOf(strings.join('')) < 30000) {
    continue;
  }
  const chainSegs = { segments: encodeChainPool(strings, 65535) };
  const literalSegs = segmentLiteral(strings, 65535);
  const chainDecode = time(() => decodeChainPool(chainSegs.segments));
  const literalDecode = time(() => decodeLiteral(literalSegs));
  perf.push([label, (chainDecode * 1000).toFixed(1), (literalDecode * 1000).toFixed(1), (chainDecode / literalDecode).toFixed(1) + 'x']);
}

// decision headlines
const bestOf = (rows: StructureResult[], col: 'raw' | 'gzPerModule' | 'gzConcat') =>
  rows.reduce((best, r) => (r[col] < best[col] ? r : best));

const decision = [
  '## 5. What the numbers decide',
  '',
  '**Scenario A (one family).** The delta structures dominate: base-delta cuts raw cache bytes 3.6x vs per-locale literals (24.3 vs 88.8 KB) and lazy wire bytes 3.5x (11.7 vs 40.8 KB); eager gz is a near-tie (11.1 vs 11.7 KB) — gzip recovers cross-locale text overlap inside one bundle, but a single-bundle eager app is the only case where literals compete. The 1.x pair maps stay within ~5% of mask+indices even at 20% overrides: the delta-vs-full STRUCTURE is worth ~20x more than the pair-vs-mask representation. Shared-pool structures lose (u16 index arrays are incompressible X85: shared-full lazy gz 28.2 KB, shared-delta 14.2 KB).',
  '',
  '**Scenario B (cross-family, ~15% shared values).** Shared pools do NOT pay: literals win both gz modes (eager 18.2 vs 25.6 KB; lazy 23.1 vs 24.8 KB) — the shared pool dedups only 15% of values while the per-locale index arrays add incompressible bytes. Cross-language value sharing is better left to gzip (eager) or base+delta structures within a family.',
  '',
  '**Scenario C (numeric tables).** Delta-encoded tables win raw (+23%) and lazy gz (+34%); eager gz is a tie. Adopt deltas for numeric tables.',
  '',
  '**Layout decisions for the generator (per config shape):**',
  '',
  '- single locale, small eager sets -> literal pool modules (v0.1, unchanged)',
  '- multiple variants of one family (en + en-GB + en-AU + en-CA) -> base module + per-variant deltas (mask or pairs; both within 5%, pick pairs for simplicity)',
  '- cross-family sets (en + fr + de) -> literal modules (shared pools rejected at <= 15% overlap; re-measure above ~40% if such configs appear)',
  '- numeric tables -> base + delta-from-base u16 arrays (GVE16)',
  '',
  'Re-validate with real CLDR data: real duplication/entropy differs from synthetic pools; the crossover points (family overlap, override density) move with the data.',
  '',
].join('\n');

const md = [
  '# Pool-encoding re-baseline + real-data pack structure',
  '',
  `_Recorded ${new Date().toISOString()}_ — scripts/benchmark-pools.ts; design context: plans/real-data-pack-design.md.`,
  '',
  '## 1. Pool transport (mono-locale): array literal vs literal+offsets vs X85 chain',
  '',
  'Module text bytes raw + gzip; gz = what crosses the wire.',
  '',
  transportRows.map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`)).join('\n'),
  '',
  '## 2. Decode time (largest pools)',
  '',
  perf.map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`)).join('\n'),
  '',
  '## 3. Multi-locale structures (real-data pack design gates)',
  '',
  'raw module bytes = in-cache cost of the TS modules; gz concat = eager single-bundle wire bytes; gz per-module = lazy/chunked wire bytes (each module compressed separately).',
  '',
  ...structureTables(labelA, rowsA),
  ...structureTables(labelB, rowsB),
  '## 4. Numeric tables: full vs delta',
  '',
  `### ${labelC}`,
  '',
  [
    ['structure', 'raw module bytes (cache)', 'gz concat (eager)', 'gz per-module (lazy)', 'modules', 'note'],
    ...rowsC.map((r) => [r.name, String(r.raw), String(r.gzConcat), String(r.gzPerModule), String(r.modules), r.note]),
  ]
    .map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`))
    .join('\n'),
  '',
  decision,
].join('\n');

writeFileSync('notes/pool-rebaseline.md', md);
console.log(md);

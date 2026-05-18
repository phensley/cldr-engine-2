/**
 * Pool-encoding re-baseline (follow-up to S1's findings):
 *
 *   pnpm benchmark:pools
 *
 * S1 measured utf8-vs-utf16 and settled the 16-bit question, but flag ed
 * that the codec chain (X85-encoded bytes) may lose to PLAIN LITERAL
 * UTF-8 text at real CLDR scale and under gzip. This benchmark compares,
 * for representative synthetic pools (2.5 KB → 800 KB, ASCII-dominant
 * through CJK/accents, with quote/backslash escape stress):
 *
 *   json     — the naive representation: a JSON array literal
 *   literal  — pool data as a plain double-quoted string literal + u16
 *              code-unit offsets (GVE16/X85 for the offsets only) —
 *              decode is String.slice, zero copies
 *   chain    — the current ship format: X85-encoded UTF-8 bytes + u16
 *              byte offsets (chunked > 65535 units/bytes)
 *
 * Each measured as module text bytes (raw + gzip). Decode perf for the
 * two real transports (literal vs chain) on the largest pools.
 *
 * Results recorded to notes/pool-rebaseline.md. The decision this feeds:
 * whether pools should ship as literal strings (format change) or keep
 * the X85 transport.
 */
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { decodeX85, decodeX85GVE16, encodeGVE16, encodeX85, packU16, toU16 } from '../internal/data-pipeline/src/index.js';

/**
 * The v0 chain transport, self-contained (the pipeline no longer ships it
 * — this benchmark compares against the format that the re-baseline
 * replaces).
 */
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
  const bytes: number[] = [];
  const offsets: number[] = [];
  for (const s of strings) {
    offsets.push(bytes.length);
    for (const c of new TextEncoder().encode(s)) {
      bytes.push(c);
    }
  }
  offsets.push(bytes.length);
  return { offsets: encodeX85(encodeGVE16(toU16(offsets))), data: encodeX85(new Uint8Array(bytes)) };
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
  /** share of names carrying a double quote or backslash (escape stress) */
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

/** The four pools under test: A tiny, B names-like, C full-locale-like, D heavy non-ASCII. */
const POOLS: Array<[string, string[]]> = [
  ['A (2.5 KB, 250)', makePool(250, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.01 }, 1)],
  ['B (30 KB, 3k)', makePool(3000, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.003 }, 2)],
  ['C (800 KB, 25k)', makePool(25000, { accentRatio: 0.08, heavyRatio: 0, escapeRatio: 0.003 }, 3)],
  ['D (150 KB, 5k, CJK/Cyrillic)', makePool(5000, { accentRatio: 0.15, heavyRatio: 0.55, escapeRatio: 0.003 }, 4)],
];

// ---------------------------------------------------------------------------
// candidates

const bytesOf = (s: string) => new TextEncoder().encode(s).length;
const gz = (s: string) => gzipSync(new TextEncoder().encode(s)).length;

/** Module text for the naive JSON array literal. */
const jsonModule = (strings: string[]): string => JSON.stringify(strings);

/** Split so each segment's data stays within u16 (units for literal, bytes for chains). */
const segmentLiteral = (strings: string[], maxUnits: number): PoolPack[] => {
  const segments: PoolPack[] = [];
  let current: string[] = [];
  let units = 0;
  for (const s of strings) {
    const u = s.length; // BMP pools: 1 unit per char
    if (current.length > 0 && units + u > maxUnits) {
      segments.push({ codec: 'literal', offsets: packU16(accOffsets(current)), data: current.join('') });
      current = [];
      units = 0;
    }
    current.push(s);
    units += u;
  }
  segments.push({ codec: 'literal', offsets: packU16(accOffsets(current)), data: current.join('') });
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

// ---------------------------------------------------------------------------
// decode timing (warmup + adaptive)

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

const decodeLiteral = (segments: Array<{ offsets: string; data: string }>, all: string[]) => {
  const out: string[] = [];
  for (let s = 0; s < segments.length; s++) {
    const offsets = Array.from(decodeX85GVE16(segments[s].offsets));
    const data = segments[s].data;
    for (let i = 0; i < offsets.length - 1; i++) {
      out.push(data.slice(offsets[i], offsets[i + 1]));
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// run

const rows: string[][] = [
  ['pool', 'candidate', 'module bytes', 'gz bytes', 'gz vs literal', 'segments'],
];

const perf: string[][] = [['pool', 'chain decode (us/op)', 'literal decode (us/op)', 'ratio']];

for (const [label, strings] of POOLS) {
  const rawBytes = bytesOf(strings.join(''));
  const jsonText = jsonModule(strings);
  const literalSegs = segmentLiteral(strings, 65535);
  const chainSegs = { segments: encodeChainPool(strings, 65535) };

  const literalSegsText = JSON.stringify({ codec: 'literal', segments: literalSegs });
  const chainText = JSON.stringify(chainSegs);

  const j = { b: bytesOf(jsonText), g: gz(jsonText) };
  const l = { b: bytesOf(literalSegsText), g: gz(literalSegsText) };
  const c = { b: bytesOf(chainText), g: gz(chainText) };
  rows.push(
    [label, 'json (array literal)', String(j.b), String(j.g), `${((j.g / l.g) * 100).toFixed(0)}%`, '—'],
    [label, 'literal (+u16 unit offsets)', String(l.b), String(l.g), '100%', String(literalSegs.length)],
    [label, 'chain (X85 utf8 + byte offsets)', String(c.b), String(c.g), `${((c.g / l.g) * 100).toFixed(0)}%`, String(chainSegs.segments.length)],
  );

  // decode perf on the real transports (>= 30 KB pools)
  if (rawBytes >= 30000) {
    const chainDecode = time(() => decodeChainPool(chainSegs.segments));
    const literalDecode = time(() => decodeLiteral(literalSegs, strings));
    perf.push([label, (chainDecode * 1000).toFixed(1), (literalDecode * 1000).toFixed(1), (chainDecode / literalDecode).toFixed(1) + 'x']);
  }
}

const md = [
  '# Pool-encoding re-baseline: literal UTF-8 vs the codec chain',
  '',
  `_Recorded ${new Date().toISOString()}_ — follow-up to S1 findings, script: scripts/benchmark-pools.ts.`,
  '',
  'Compares how a string pool ships inside a module: as a JSON array literal, as a plain double-quoted string literal with u16 code-unit offsets (decode = String.slice), or through the S1 ship format (X85-encoded UTF-8 bytes with u16 byte offsets, chunked). gz = gzip of the module text (what crosses the wire).',
  '',
  rows.map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`)).join('\n'),
  '',
  '## Decode time (largest pools)',
  '',
  perf.map((r, i) => (i === 0 ? `| ${r.join(' | ')} |\n| ${r.map(() => '---').join(' | ')} |` : `| ${r.join(' | ')} |`)).join('\n'),
  '',
  '## What the numbers decide',
  '',
  'Gate (from the S1 follow-up): adopt literal transport if it wins raw bytes by >= 5% or gz by >= 10% at pools >= 10 KB, and decode stays within 2x of the chain. The decision is recorded in plans/pack-format-spec.md; the generator default follows it.',
  '',
].join('\n');

writeFileSync('notes/pool-rebaseline.md', md);
console.log(md);

// quick verdict
const verdict = rows
  .filter((r) => r[1] === 'chain (X85 utf8 + byte offsets)')
  .map((r) => ({ pool: r[0], module: Number(r[2]), gz: Number(r[3]), literalGz: Number(rows.find((x) => x[0] === r[0] && x[1].startsWith('literal'))?.[3] ?? 0) }))
  .map((r) => `  ${r.pool}: chain ${r.module} B / gz ${r.gz} — literal gz ${r.literalGz} B`);
console.log('\nchain vs literal (gz):\n' + verdict.join('\n'));

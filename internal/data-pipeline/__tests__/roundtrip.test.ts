/**
 * Round-trip tests: compile the mini-cldr dataset, decode, and require
 * exhaustive equality with the source — for BOTH pool codecs (the S1-M4
 * benchmark decides which one ships).
 */
import { compileDataset, decodeChunkedPool, decodeLocalePack, decodeNumericPack, encodeChunkedPool, encodePool, lookupTrieValue, miniCldr, toU16 } from '../src/index.js';
import type { Dataset } from '../src/index.js';

const CODECS = ['utf8', 'utf16'] as const;

const original = (tag: string) => miniCldr.locales[tag];

describe('pack round-trip', () => {
  for (const codec of CODECS) {
    describe(`codec ${codec}`, () => {
      const compiled = compileDataset(miniCldr, { poolCodec: codec });

      it('territories: every code resolves to its display name', () => {
        for (const [tag, pack] of Object.entries(compiled.locale)) {
          const d = decodeLocalePack(pack);
          const src = original(tag);
          for (const [code, name] of Object.entries(src.territories)) {
            const v = lookupTrieValue(code, d.territoryTrie);
            expect(v, `${tag}: ${code}`).toBeDefined();
            expect(d.pool[v!], `${tag}: ${code}`).toBe(name);
          }
        }
      });

      it('currencies: symbol + fraction digits both survive', () => {
        for (const [tag, pack] of Object.entries(compiled.locale)) {
          const d = decodeLocalePack(pack);
          const src = original(tag);
          for (const [code, cur] of Object.entries(src.currencies)) {
            const v = lookupTrieValue(code, d.currencyTrie);
            expect(v, `${tag}: ${code}`).toBeDefined();
            const poolIndex = d.currencyTable[v! * 2];
            const digits = d.currencyTable[v! * 2 + 1];
            expect(d.pool[poolIndex], `${tag}: ${code} symbol`).toBe(cur.symbol);
            expect(digits, `${tag}: ${code} digits`).toBe(cur.fractionDigits);
          }
        }
      });

      it('patterns: fixed order [decimal, percent, currency]', () => {
        for (const [tag, pack] of Object.entries(compiled.locale)) {
          const d = decodeLocalePack(pack);
          const src = original(tag);
          expect(d.patterns).toEqual([src.patterns.decimal, src.patterns.percent, src.patterns.currency]);
        }
      });

      it('numeric: keys and values match the shared table', () => {
        const d = decodeNumericPack(compiled.numeric);
        expect(d.keys).toEqual([...miniCldr.numeric.keys]);
        expect(d.values).toEqual([...miniCldr.numeric.values]);
      });

      it('locale granularity: en carries only its own strings', () => {
        // Strings identical across locales (e.g. "France" = en+fr name for FR)
        // legitimately appear; what must not appear is another locale's
        // distinct spelling. The exact-pool test below asserts the full set.
        const d = decodeLocalePack(compiled.locale.en);
        for (const [code, name] of Object.entries(original('en').territories)) {
          expect(d.pool[lookupTrieValue(code, d.territoryTrie)!], `en: ${code}`).toBe(name);
        }
      });

      it('pool strings: exactly the deduped, sorted source strings', () => {
        for (const [tag, pack] of Object.entries(compiled.locale)) {
          const d = decodeLocalePack(pack);
          const expected = [
            ...new Set([...Object.values(original(tag).territories), ...Object.values(original(tag).currencies).map((c) => c.symbol)]),
          ].sort();
          expect(d.pool).toEqual(expected);
        }
      });
    });
  }
});

describe('u16 wire-domain guard', () => {
  it('rejects values above the ceiling', () => {
    expect(() => toU16([65536])).toThrow(/outside the u16 wire domain/);
    expect(() => toU16([1, 2, 65535])).not.toThrow();
  });
  it('rejects negatives and non-integers', () => {
    expect(() => toU16([-1])).toThrow(/outside the u16 wire domain/);
    expect(() => toU16([1.5])).toThrow(/outside the u16 wire domain/);
  });
});

describe('compile determinism', () => {
  it('produces byte-identical output across runs', () => {
    for (const codec of CODECS) {
      const a = JSON.stringify(compileDataset(miniCldr, { poolCodec: codec }));
      const b = JSON.stringify(compileDataset(miniCldr, { poolCodec: codec }));
      expect(a).toBe(b);
    }
  });
  it('rejects non-parallel numeric tables', () => {
    const bad: Dataset = { locales: {}, numeric: { keys: ['a'], values: [] } };
    expect(() => compileDataset(bad)).toThrow(/not parallel/);
  });
});

describe('chunked pools (16-bit overflow path)', () => {
  it('preserves strings across segment boundaries', () => {
    const strings = Array.from({ length: 3000 }, (_, i) => `Name${String(i).padStart(4, '0')}`);
    for (const codec of CODECS) {
      const chunked = encodeChunkedPool(strings, codec, /* force splitting */ 4096);
      expect(chunked.segments.length).toBeGreaterThan(1);
      expect(decodeChunkedPool(chunked)).toEqual(strings);
    }
  });

  it('produces a single segment when everything fits', () => {
    const chunked = encodeChunkedPool(['a', 'b'], 'utf8');
    expect(chunked.segments).toHaveLength(1);
    expect(decodeChunkedPool(chunked)).toEqual(['a', 'b']);
  });

  it('single-pool encoding overflows at >65535 offsets (guard throws)', () => {
    const many = Array.from({ length: 40000 }, (_, i) => `x${i}`);
    // utf8: ~3-6 bytes per string → data stream > 65535 → offsets overflow
    expect(() => encodePool(many, 'utf8')).toThrow(/outside the u16 wire domain/);
  });
});

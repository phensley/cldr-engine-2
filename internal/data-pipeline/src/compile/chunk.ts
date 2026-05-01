/**
 * Chunked pools — the overflow path for the S1 16-bit ceiling question.
 *
 * Single-pool encoding caps offsets at 65535 (bytes for utf8, code units
 * for utf16), i.e. ~64KB of pool data. Real CLDR pools exceed that, so
 * pools may be split into segments, each a plain PoolPack whose data fits
 * the u16 domain. Segment-internal layout stays stock, so every existing
 * codec/decoder applies unchanged.
 *
 * NOTE: segments renumber references (a string is (segment, localIndex),
 * not a flat pool index). The v0 pack format uses flat single-segment
 * pools; the chunked form is the measured escape hatch — the S1-M4
 * benchmark records the costs that settle the GVE32-vs-chunks decision.
 */
import type { PoolCodec, PoolPack } from '../pack/types.js';
import { decodePool } from '../pack/decode.js';
import { encodePool, U16_CEILING } from './pool.js';

export interface ChunkedPoolPack {
  codec: PoolCodec;
  segments: PoolPack[];
}

/**
 * Split strings into segments so no segment's data stream exceeds
 * `maxSegmentData` u16 units / bytes. A single string larger than the cap
 * cannot be chunked at this granularity and throws from encodePool.
 */
export const encodeChunkedPool = (
  strings: readonly string[],
  codec: PoolCodec,
  maxSegmentData = U16_CEILING,
): ChunkedPoolPack => {
  const segments: PoolPack[] = [];
  let current: string[] = [];
  let size = 0;
  for (const s of strings) {
    const cost = codec === 'utf16' ? s.length : new TextEncoder().encode(s).length;
    if (current.length > 0 && size + cost > maxSegmentData) {
      segments.push(encodePool(current, codec));
      current = [];
      size = 0;
    }
    current.push(s);
    size += cost;
  }
  if (current.length > 0) {
    segments.push(encodePool(current, codec));
  }
  return { codec, segments };
};

/** Flatten a chunked pool back into its strings, order preserved. */
export const decodeChunkedPool = (pack: ChunkedPoolPack): string[] => pack.segments.flatMap(decodePool);

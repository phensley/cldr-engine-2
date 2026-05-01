/**
 * Decode a GVE16 array from an X85 wrapper in a single pass.
 *
 * GVE16 - Group Varint Encoding for 16-bit unsigned integers
 * X85 - Custom ASCII85 binary encoding
 */
export const decodeX85GVE16 = (input: string): Uint16Array => {
  // input read index
  let i = 0;
  // output write index
  let j = 0;
  // 32-bit decode accumulator
  let v = 0;
  // group varint selector byte
  let e = 0;
  // selector byte cycle index (length 9)
  let y = 0;
  // resume flag
  let r = 0;
  // output buffer (length read from first 4 bytes of input)
  let out: Uint16Array | undefined;

  const ilen = input.length;
  // This loop iterates once for every 5 characters and input
  // string length is always a multiple of 5.
  while (i < ilen) {
    // Translate blocks of 5 characters into a 32-bit unsigned integer
    let c = input.charCodeAt(i++);
    v = v * 85 + ((c > 92 ? c - 1 : c) - 40);
    if (i % 5) {
      continue;
    }

    if (out) {
      // Read 4 bytes from 32-bit unsigned integer
      for (const shift of [24, 16, 8, 0]) {
        const n = (v >>> shift) & 255;

        if (y % 9 === 0) {
          // Read a selector byte every 9 bytes.
          e = n;
          // Reset selector mask index.
          y = 1;
        } else if (r) {
          // Resume a two-byte sequence.
          out[j++] += n;
          // Reset the resume flag
          r = 0;
          // Increment selector mask index
          y++;
        } else if (e & (1 << (y - 1))) {
          // Start a two-byte sequence. Decode, leaving
          // write index unmodified.
          out[j] = n << 8;
          // Set resume flag.
          r = 1;
        } else {
          // One-byte sequence.
          out[j++] = n;
          // Increment selector mask index.
          y++;
        }
      }
    } else {
      // First 32-bit unsigned integer holds exact output buffer length
      out = new Uint16Array(v);
    }
    v = 0;
  }
  return out!;
};

/**
 * Bare X85 decode: translate an X85 string back into bytes (no GVE16
 * wrapper). Input length is always a multiple of 5 (the encoder pads to
 * 4-byte groups); every 5 characters yield 4 bytes.
 *
 * The encoder's zero padding is restored, so the returned buffer is
 * ceil(N/4)*4 bytes: callers carrying the true length elsewhere (e.g. a
 * pool's offsets sentinel) should slice to it.
 */
export const decodeX85 = (input: string): Uint8Array => {
  const out = new Uint8Array((input.length / 5) * 4);
  let v = 0;
  let o = 0;
  const ilen = input.length;
  for (let i = 0; i < ilen; i++) {
    const c = input.charCodeAt(i);
    v = v * 85 + ((c > 92 ? c - 1 : c) - 40);
    if ((i + 1) % 5 === 0) {
      for (const shift of [24, 16, 8, 0]) {
        out[o++] = (v >>> shift) & 255;
      }
      v = 0;
    }
  }
  return out;
};

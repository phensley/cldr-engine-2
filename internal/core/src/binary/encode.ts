/**
 * Custom ASCII85 encoder (X85) for storing 8-bit binary data inside
 * JavaScript, TypeScript, JSON, with minimal overhead.
 *
 * We take a group of four bytes and convert it into a group of five
 * ASCII characters:
 *
 *    Bytes   [5, 4, 3, 2]
 *  Integer   5 * 256^3 + 4 * 256^2 + 3 * 256^2 + 2 * 256^0
 *            84148994
 *  Base 85   1 * 85^4 + 52 * 85^3 + 1 * 85^2 + 78 * 85^1 + 14 * 85^0
 *            84148994
 *  Factors   [1, 52, 1, 78, 14]
 *
 * We then represent the factors using a contiguous range of ASCII
 * characters, from 40 "(" through 125 "}", skipping 92 "\\" backslash.
 * None of the characters in this range require escapes when stored
 * inside either a single- or double-quoted string:
 *
 *   Chars    [41, 93, 41, 119, 54]
 *     X85    ")])w6"
 *
 * Encoding algorithm, given the maximum 4-byte value:
 * [255, 255, 255, 255]
 *
 * This can be represented by a 32-bit unsigned integer:
 * 255 * 256^3 + 255 * 256^2 + 255 * 256^1 + 255 * 256^0 = 4294967295
 *
 * This integer can be expressed as powers of 85 to obtain 5 numbers
 * in the range [0, 85):
 * (82 * 85^4) + (23 * 85^3) + (54 * 85^2) + (12 * 85) + (0 * 1)
 * Result: [82, 23, 54, 12, 0]
 *
 * Add 40 to the numbers so they fall in our ASCII range:
 * [82 + 40, 23 + 40, 54 + 40, 12 + 40, 0 + 40] = [122, 63, 94, 52, 40]
 *
 * Add one to the ASCII values greater than or equal to 92, in order
 * to skip over the backslash character "\\":
 * [123, 63, 95, 52, 40]
 *
 * Append the corresponding ASCII characters to the string result:
 * 123 = "{"  63 = "?"  95 = "_"  52 = "4"  40 = "("
 *
 *  Input: [255, 255, 255, 255]
 * Output: "{?_4("
 */
export const encodeX85 = (arr: Uint8Array): string => {
  const ilen = Math.ceil(arr.length / 4) * 4;
  // input read index
  let i = 0;
  // 32-bit unsigned integer temporary
  let v = 0;
  // result string
  let res = '';
  while (i < ilen) {
    // accumulate first 4 bytes into 32-bit integer
    v = v * 256 + (arr[i++] || 0);
    if (i % 4) {
      continue;
    }
    // encode 32-bit integer as 5 8-bit characters using powers of 85.
    for (const d of [52200625, 614125, 7225, 85, 1]) {
      const j = (Math.floor(v / d) % 85) + 40;
      res += String.fromCharCode(j > 91 ? j + 1 : j);
    }
    v = 0;
  }
  return res;
};

/**
 * Group Varint Encoding converts an array of 16-bit unsigned integers
 * to an array of bytes, with one bit of overhead for each integer.
 *
 * This provides a good compression ratio when most bytes are small
 * values less than 256.
 *
 * For each group of 8 integers one selector byte is written, where each
 * bit corresponds to the byte length of an integer:
 *
 *   0 = values 0-255 stored as 1 byte
 *   1 = values 256-65535 stored as 2 bytes
 *
 * For an input array consisting of only 8-bit values the size savings
 * would reach approx. 44%, with 9 output bytes to represent 16 input
 * bytes: 1 - (9 / 16) = 0.4375
 *
 * Encoding algorithm:
 *
 * Given the array of six 16-bit unsigned integers:
 * [17, 255, 256, 1, 65535, 33]
 *
 * Write the length of the input array to the output stream as 4 bytes:
 * [0, 0, 0, 6]
 *
 * For the first group of eight integers, write a placeholder selector
 * byte to the output stream:
 * [0, 0, 0, 6, 0]
 *
 * Write the integers to the output stream as 1- or 2-byte sequences,
 * flipping bits in the selector byte accordingly:
 * [0, 0, 0, 6, 0, 17, 255, 1, 0, 1, 255, 255, 33]
 *
 * Final selector byte value is 52, in binary 00110100 when the bits
 * are read from right to left means the 3rd, 5th, and 6th numbers are
 * encoded using 2 bytes.
 *
 * Update the selector byte in output stream:
 * [0, 0, 0, 6, 52, 17, 255, 1, 0, 1, 255, 255, 33]
 *
 * Pad output to be a multiple of 4:
 * [0, 0, 0, 6, 52, 17, 255, 1, 0, 1, 255, 255, 33, 0, 0, 0]
 *
 * Condsidering only the data portion of the output stream (not the
 * header or padding) the 6 original 16-bit values would have required
 * 12 bytes, and our encoding uses 8 data bytes with 1 byte of overhead,
 * for 9 bytes representing a 25% savings.
 */
export const encodeGVE16 = (u16: Uint16Array): Uint8Array => {
  const len = u16.length;
  // input read index
  let i = 0;
  // result bytes
  const res: number[] = [];

  // Prefix array with 4 zero bytes to encode the length of
  // the original array. This lets us allocate the exact
  // size needed when decoding.
  res.push((len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255);

  while (i < len) {
    // Save position of the selector byte in the output
    let j = res.length;
    // Insert placeholder for the selector byte
    res.push(0);
    // Initial selector byte
    let selector = 0;
    // Index of the current bit
    let k = 0;
    while (k < 8) {
      const n = u16[i + k] || 0;
      const bit = n > 255 ? 1 : 0;
      selector |= bit << k;
      if (bit) {
        res.push(n >> 8, n & 255);
      } else {
        res.push(n);
      }
      k++;
    }
    // Update selector byte in output
    res[j] = selector;
    i += 8;
  }

  // Pad output length to a multiple of 4
  let over = Math.ceil(res.length / 4) * 4 - res.length;
  while (over) {
    res.push(0);
    over--;
  }
  return new Uint8Array(res);
};

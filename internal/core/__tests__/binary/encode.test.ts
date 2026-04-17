import { decodeX85GVE16 } from '../../src/binary/decode.js';
import { encodeGVE16, encodeX85 } from '../../src/binary/encode.js';
import { randgen, randomNumbers } from '../random.js';

const array = (arr: number[]) => new Uint8Array(arr);

/**
 * Notes on manual decoding of the X85 test cases.
 *
 * This encoding uses ASCII characters in the range from
 * "(" (decimal 40) to "}" (decimal 125).  All characters
 * in this range are used except "\" (decimal 92).
 *
 * The characters used are visible in this ASCII table;
 * all unused characters are blank:
 *
 *       00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f
 * 0020                           (  )  *  +  ,  -  .  /
 * 0030   0  1  2  3  4  5  6  7  8  9  :  ;  <  =  >  ?
 * 0040   @  A  B  C  D  E  F  G  H  I  J  K  L  M  N  O
 * 0050   P  Q  R  S  T  U  V  W  X  Y  Z  [     ]  ^  _
 * 0060   `  a  b  c  d  e  f  g  h  i  j  k  l  m  n  o
 * 0070   p  q  r  s  t  u  v  w  x  y  z  {  |  }
 *
 * To translate ASCII characters into numbers use this
 * conversion:
 *
 *  base = (c: number) => (c > 92 ? c - 1 : c) - 40
 *
 * Example: the bytes [0, 1, 1, 0] encode to the string
 * "((11*" and can be decoded as follows.
 *
 * 1. Convert the X85-encoded string into an array of ASCII
 *    character values:
 *
 *    ["(", "(", "1", "1", "*"]
 *    [ 40,  40,  49,  49,  42]
 *
 * 2. Shift character values into correct numeric range by
 *    subtracting 40 from each. These represent the factors
 *    for the powers of 85:
 *
 *    [0, 0, 9, 9, 2]
 *
 * 3. Multiply the terms by powers of 85 and sum to get a 32-bit
 *    unsigned integer:
 *
 *    (0 * 85^4) + (0 * 85^3) + (9 * 85^2) + (9 * 85^1) + (2 * 85^0)
 *     0 + 0 + 65025 + 765 + 2
 *     65792
 *
 * 4. Split the integer into four bytes:
 *
 *     65792
 *     0 + 65536 + 256 + 0
 *     (0 << 24) + (1 << 16) + (1 << 8) + (0 << 0)
 *
 * 5. The decoded bytes are:
 *
 *    [0, 1, 1, 0]
 */
test('x85 encode', () => {
  // Output is always a multiple of 5 and is zero-padded
  expect(encodeX85(array([0]))).toEqual('(((((');
  expect(encodeX85(array([0, 0]))).toEqual('(((((');
  expect(encodeX85(array([0, 0, 0, 0, 0]))).toEqual('((((((((((');
  expect(encodeX85(array([0, 0, 0, 0, 0, 0]))).toEqual('((((((((((');

  expect(encodeX85(array([0, 0, 0, 0]))).toEqual('(((((');
  expect(encodeX85(array([0, 0, 0, 1]))).toEqual('(((()');
  expect(encodeX85(array([0, 0, 0, 2]))).toEqual('((((*');
  expect(encodeX85(array([0, 0, 0, 3]))).toEqual('((((+');
  expect(encodeX85(array([0, 0, 0, 84]))).toEqual('((((}');
  expect(encodeX85(array([0, 0, 0, 85]))).toEqual('((()(');
  expect(encodeX85(array([0, 0, 0, 255]))).toEqual('(((+(');

  expect(encodeX85(array([0, 0, 1, 0]))).toEqual('(((+)');
  expect(encodeX85(array([0, 0, 2, 0]))).toEqual('(((.*');
  expect(encodeX85(array([0, 0, 84, 0]))).toEqual('((*{}');
  expect(encodeX85(array([0, 0, 85, 0]))).toEqual('((+)(');

  expect(encodeX85(array([0, 1, 0, 0]))).toEqual('((1.)');
  expect(encodeX85(array([0, 1, 1, 0]))).toEqual('((11*');
  expect(encodeX85(array([0, 1, 1, 1]))).toEqual('((11+');
  expect(encodeX85(array([0, 2, 0, 0]))).toEqual('((:4*');

  expect(encodeX85(array([1, 0, 0, 0]))).toEqual('(CC1)');
  expect(encodeX85(array([1, 1, 1, 1]))).toEqual('(CL:,');

  expect(encodeX85(array([5, 4, 3, 2]))).toEqual(')])w6');

  expect(encodeX85(array([255, 255, 255, 255]))).toEqual('{?_4(');
});

test('gve16 encode', () => {
  let input = new Uint16Array([0, 1, 255, 256, 1023, 65535]);
  expect(input.byteLength).toEqual(12);

  let actual = encodeGVE16(input);

  // prettier-ignore
  expect(actual).toEqual(new Uint8Array([
    0,   // 32-bit unsigned integer length of input array
    0,   //
    0,   //
    6,   //
    56,  // selector byte: 00111000 elements 4, 5, and 6 use two bytes
    0,   // element 1: 00000000
    1,   // element 2: 00000001
    255, // element 3: 11111111
    1,   // element 4: 00000001 00000000 = 256
    0,   //
    3,   // element 5: 00000011 11111111 = 1023
    255, //
    255, // element 6: 11111111 11111111 = 65535
    255, //
    0,   // zero pad so output array length is a multiple of 4
    0,   //
  ]));
  expect(actual.length).toEqual(16);
});

test('gve16 space savings crossover point', () => {
  const limit = 1000;

  // best case small integers
  const best: number[] = [];
  for (let i = 0; i < limit; i++) {
    best.push(255);
  }

  // worst case large integers
  const worst: number[] = [];
  for (let i = 0; i < limit; i++) {
    worst.push(65535);
  }

  for (let i = 1; i < limit; i++) {
    // With small integers compression ratio will improve quickly with
    // increasing input length.
    let input = new Uint16Array(best.slice(0, i));
    let enc = encodeGVE16(input);
    if (input.byteLength <= enc.length) {
      expect(i).toBeLessThanOrEqual(12);
    }

    // In the best case, arrays consisting only of small integers, once
    // the array length is over 200 the space savings reaches 40% and
    // gradually approaches the 45% limit as length increases.
    const savings = Math.floor((1 - enc.length / input.byteLength) * 100);
    if (i >= 200) {
      expect(savings).toBeGreaterThanOrEqual(40);
    }

    // In the worst case, arrays consisting of only large 16-bit integers,
    // space savings is impossible since in both cases we must use two bytes
    // for each integer, and GVE16 adds 1 byte of overhead for each group
    // of 8 integers plus a 4-byte header and zero padding.
    input = new Uint16Array(worst.slice(0, i));
    enc = encodeGVE16(input);
    expect(input.byteLength).toBeLessThan(enc.length);
  }
});

test('gve16 output length muliple of 4', () => {
  const gen = randgen(1309);
  const input = new Uint16Array(randomNumbers(gen, 5000, 65535));
  for (let i = 1; i < input.length; i++) {
    const slice = input.slice(0, i);
    const u16 = encodeGVE16(slice);
    expect(u16.length % 4, `case i ${i}`).toEqual(0);
  }
});

test('gve16 and x85 round trip', () => {
  const cases: number[][] = [
    [1],
    [1, 2, 3, 4],
    [1, 1, 1, 1, 1, 1],
    [65535],
    [255],
    [256],
    [65535, 65535, 10000, 20000, 30000, 10000],
    [256, 65535, 1, 65535],
  ];

  for (let i = 0; i < cases.length; i++) {
    const arr = cases[i];
    for (let j = 0; j < arr.length; j++) {
      const slice = arr.slice(0, j + 1);
      const expected = new Uint16Array(slice);
      const gve = encodeGVE16(expected);
      const x85 = encodeX85(gve);
      const actual = decodeX85GVE16(x85);
      expect(expected, `case ${i + 1} ${JSON.stringify(slice)}`).toEqual(actual);
    }
  }
});

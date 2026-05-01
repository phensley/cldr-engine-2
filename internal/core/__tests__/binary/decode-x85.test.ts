/**
 * Bare X85 decode tests (the fused decodeX85GVE16 path is covered by
 * encode.test.ts + offzone.test.ts). decodeX85 restores the encoder's
 * zero padding, so round-trips compare against the source length.
 */
import { decodeX85 } from '../../src/binary/decode.js';
import { encodeX85 } from '../../src/binary/encode.js';
import { randgen, randomNumbers } from '../random.js';

test('decodes the documented [0, 1, 1, 0] vector', () => {
  expect(Array.from(decodeX85('((11*'))).toEqual([0, 1, 1, 0]);
});

test('decodes the documented [255, 255, 255, 255] vector', () => {
  expect(Array.from(decodeX85('{?_4('))).toEqual([255, 255, 255, 255]);
});

test('round-trips empty input', () => {
  expect(Array.from(decodeX85(encodeX85(new Uint8Array(0))))).toEqual([]);
});

test('round-trips short inputs (not multiples of 4)', () => {
  for (const len of [1, 2, 3]) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = i * 40 + len;
    expect(Array.from(decodeX85(encodeX85(bytes)).subarray(0, len))).toEqual(Array.from(bytes));
  }
});

test('round-trips random byte arrays across the full byte domain', () => {
  const gen = randgen(0xdecade);
  for (const len of [0, 1, 4, 5, 6, 64, 255, 256, 1024]) {
    const nums = randomNumbers(gen, len, 256);
    const bytes = new Uint8Array(nums);
    expect(Array.from(decodeX85(encodeX85(bytes)).subarray(0, len)), `len ${len}`).toEqual(Array.from(bytes));
  }
});

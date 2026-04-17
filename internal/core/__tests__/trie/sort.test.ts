import { asciiSort } from '../../src/trie/encode.js';

test('child code sort', () => {
  const cc = (c: string) => c.charCodeAt(0);
  expect(asciiSort(cc('a'), cc('a'))).toEqual(1); // order doesn't matter
  expect(asciiSort(cc('a'), cc('A'))).toEqual(-1); // sorted: ('a', 'A')
  expect(asciiSort(cc('A'), cc('a'))).toEqual(1); // sorted: ('a', 'A')
  expect(asciiSort(cc('a'), cc('B'))).toEqual(-1); // sorted: ('a', 'B')
  expect(asciiSort(cc('B'), cc('a'))).toEqual(1); // sorted: ('a', 'B')
  expect(asciiSort(cc('A'), cc('b'))).toEqual(-1); // sorted: ('A', 'b')
  expect(asciiSort(cc('b'), cc('A'))).toEqual(1); // sorted: ('A', 'b')
});

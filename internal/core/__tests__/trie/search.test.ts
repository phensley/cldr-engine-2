import { addKey, newTrie } from '../../src/trie/build.js';
import { encodeTrie } from '../../src/trie/encode.js';
import { searchTrie } from '../../src/trie/search.js';
import { randgen, randomNumbers, randomStrings } from '../random.js';

test('basic', () => {
  const keys = ['a', 'B', 'aBc', 'bcDef', 'bcef', 'bcaf', 'bcqf', 'xxxxy', 'x'];
  const trie = newTrie();
  const value = (n: number) => (n + 1) * 11;
  for (let i = 0; i < keys.length; i++) {
    addKey(trie, keys[i], value(i));
  }

  const nodes: number[] = [];
  encodeTrie(trie, nodes);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const expected = { key, value: value(i) };
    expect(searchTrie(key, nodes)).toEqual(expected);
    expect(searchTrie(key.toUpperCase(), nodes)).toEqual(expected);
    expect(searchTrie(key.toLowerCase(), nodes)).toEqual(expected);
  }

  for (const key of ['aa', 'aBd', 'bcdx', 'xxxxz', 'xx']) {
    expect(searchTrie(key, nodes)).toBeUndefined();
  }
});

test('case branching', () => {
  const keys = ['Bcd', 'bc', 'Cdef', 'cdE', 'cD', 'aB', 'B', 'ABC'];
  const trie = newTrie();
  const value = (n: number) => (n + 1) * 11;
  for (let i = 0; i < keys.length; i++) {
    addKey(trie, keys[i], value(i));
  }

  const nodes: number[] = [];
  encodeTrie(trie, nodes);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const expected = { key: keys[i], value: value(i) };
    expect(searchTrie(key, nodes)).toEqual(expected);
    expect(searchTrie(key.toUpperCase(), nodes)).toEqual(expected);
    expect(searchTrie(key.toLowerCase(), nodes)).toEqual(expected);
  }
});

test('branches prefer exact match', () => {
  const keys = ['ab', 'Ab'];
  const trie = newTrie();
  const value = (n: number) => (n + 1) * 11;
  for (let i = 0; i < keys.length; i++) {
    addKey(trie, keys[i], value(i));
  }

  const nodes: number[] = [];
  encodeTrie(trie, nodes);

  expect(searchTrie('ab', nodes)).toEqual({ key: 'ab', value: 11 });
  expect(searchTrie('aB', nodes)).toEqual({ key: 'ab', value: 11 });
  expect(searchTrie('Ab', nodes)).toEqual({ key: 'Ab', value: 22 });
  expect(searchTrie('AB', nodes)).toEqual({ key: 'Ab', value: 22 });
});

test('corrupted', () => {
  expect(searchTrie('a', [])).toEqual(undefined);
  expect(searchTrie('a', [0, 0, 0])).toEqual(undefined);
});

test('random keys', () => {
  const gen = randgen(1309);
  const keys: string[] = randomStrings(gen, 1000, 1, 40);
  const searches: string[] = [];
  const t = newTrie();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    switch (i % 3) {
      case 0: {
        for (let j = key.length - 1; j > 0; j--) {
          const k = key.slice(0, j);
          searches.push(k);
          addKey(t, k, 123);
        }
        break;
      }
      case 1: {
        for (let j = 1; j < key.length; j++) {
          const k = key.slice(0, j);
          searches.push(k);
          addKey(t, k, 123);
        }
        break;
      }
      case 2: {
        const lengths = randomNumbers(gen, 20, key.length - 1).map((n) => n + 1);
        for (const len of lengths) {
          const k = key.slice(0, len);
          searches.push(k);
          addKey(t, k, 123);
        }
        break;
      }
    }
  }

  const nodes: number[] = [];
  encodeTrie(t, nodes);

  for (const key of searches) {
    expect(searchTrie(key, nodes)).toEqual({ key, value: 123 });
  }
});

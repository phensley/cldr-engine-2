import { addKey, newTrie, Trie } from '../../src/trie/build.js';
import { encodeTrie } from '../../src/trie/encode.js';
import { permutations } from '../permutation.js';

test('basic', () => {
  const trie = newTrie();
  addKey(trie, 'a', 33);
  addKey(trie, 'b', 44);
  addKey(trie, 'ab', 55);

  const nodes: number[] = [];
  encodeTrie(trie, nodes);

  // prettier-ignore
  expect(nodes).toEqual([
    10,  // [ 0]: (2 << 2) | 2 == type BRANCH (2) with 2 children
    97,  // [ 1]: char "a"
    2,   // [ 2]: jump from self (2) to node 5 == 2 + 2 + 1
    98,  // [ 3]: char "b"
    6,   // [ 4]: jump from self (4) to node 11 == 4 + 6 + 1
    7,   // [ 5]: (1 << 2) | 3 == type BRANCH_LEAF (3) with 1 child
    33,  // [ 6]: value 33 (key "a")
    98,  // [ 7]: char "b"
    0,   // [ 8]: jump from self (8) to node 9 == 8 + 0 + 1
    1,   // [ 9]: (0 << 2) | 1 == type LEAF with no suffix
    55,  // [10]: value 55 (key "ab")
    1,   // [11]: (0 << 2) | 1 == type LEAF with no suffix
    44,  // [12]: value 44 (key "b")
  ]);
});

test('insertion order', () => {
  const keys = ['a', 'b', 'aa', 'ab', 'ba', 'bb'];
  const kvs: [string, number][] = [];
  for (let i = 0; i < keys.length; i++) {
    kvs.push([keys[i], i + 1]);
  }

  const perms: [string, number][][] = [];
  permutations(perms, kvs);

  const addAll = (kvs: [string, number][]) => {
    const trie = newTrie();
    for (const kv of kvs) {
      const [key, val] = kv;
      addKey(trie, key, val);
    }
    return trie;
  };

  const trie: Trie = addAll(perms[0]);
  const nodes: number[] = [];
  encodeTrie(trie, nodes);
  for (let i = 1; i < perms.length; i++) {
    const t = addAll(perms[i]);
    const n: number[] = [];
    encodeTrie(t, n);
    expect(nodes).toEqual(n);
  }
});

test('mixed-case', () => {
  const keys = ['f', 'X', 'a', 'n', 'F', 'A', 'x', 'N'];
  const t = newTrie();
  for (let i = 0; i < keys.length; i++) {
    addKey(t, keys[i], (i + 1) * 11);
  }

  const nodes: number[] = [];
  encodeTrie(t, nodes);

  // prettier-ignore
  expect(nodes).toEqual([
   34,   // [ 0]: BRANCH with 8 children
   97,   // [ 1]: char "a"
   14,   // [ 2]: jump from self (2) to node 17 == 2 + 14 + 1
   65,   // [ 3]: char "A"
   14,   // [ 4]: jump from self (4) to node 19 == 4 + 14 + 1
   102,  // [ 5]: char "f"
   14,   // [ 6]: jump from self (6) to node 21 == 6 + 14 + 1
   70,   // [ 7]: char "F"
   14,   // [ 8]: jump from self (8) to node 23 == 8 + 14 + 1
   110,  // [ 9]: char "n"
   14,   // [10]: jump from self (10) to node 25 == 10 + 14 + 1
   78,   // [11]: char "N"
   14,   // [12]: jump from self (12) to node 27 == 12 + 14 + 1
   120,  // [13]: char "x"
   14,   // [14]: jump from self (14) to node 29 == 14 + 14 + 1
   88,   // [15]: char "X"
   14,   // [16]: jump from self (16) to node 31 == 16 + 14 + 1
   1,    // [17]: LEAF with no suffix
   33,   // [18]: value 33 (key "a")
   1,    // [19]: LEAF with no suffix
   66,   // [20]: value 66 (key "A")
   1,    // [21]: LEAF with no suffix
   11,   // [22]: value 11 (key "f")
   1,    // [23]: LEAF with no suffix
   55,   // [24]: value 55 (key "F")
   1,    // [25]: LEAF with no suffix
   44,   // [26]: value 44 (key "n")
   1,    // [27]: LEAF with no suffix
   88,   // [28]: value 88 (key "N")
   1,    // [29]: LEAF with no suffix
   77,   // [30]: value 77 (key "x")
   1,    // [31]: LEAF with no suffix
   22,   // [32]: value 22 (key "X")
  ]);
});

import { Trie } from './build.js';

const enum Bits {
  LEAF = 1,
  BRANCH = 2,
}

export const enum Type {
  LEAF = Bits.LEAF,
  BRANCH = Bits.BRANCH,
  BRANCH_LEAF = Bits.BRANCH | Bits.LEAF,
}

/**
 * Encode a Trie as an array making it more compact, cache-friendly and easily
 * serializable.
 *
 * WARNING: this encoder is designed purely for storage of timezone identifiers in
 * an array of 16-bit numbers. Given there are only a small number of unique
 * keys this encoding scheme produces numbers less than 7,000, most smaller than 255.
 *
 * TODO: add more checks to ensure all numbers are 16-bit safe.
 */
export const encodeTrie = (trie: Trie, nodes: number[]) => {
  const codes = childCodes(trie);
  const len = codes.length;

  if (len === 0) {
    // Given the way the Trie is constructed, a node with no children
    // is guaranteed to be a leaf with a defined value.
    nodes.push(nodeType(Type.LEAF, trie.suffix.length), trie.value!, ...trie.suffix);
    return;
  }

  if (trie.value !== undefined) {
    nodes.push(nodeType(Type.BRANCH_LEAF, len), trie.value);
  } else {
    nodes.push(nodeType(Type.BRANCH, len));
  }

  let offset = nodes.length;
  for (let i = 0; i < len; i++) {
    nodes.push(0, 0);
  }

  for (let i = 0; i < len; i++) {
    const code = codes[i];
    nodes[offset++] = code;
    nodes[offset++] = nodes.length - offset;
    encodeTrie(trie.children[code]!, nodes);
  }
};

const nodeType = (type: Type, data: number) => (data << 2) | type;

/**
 * Orders two character codes so that lowercase and uppercase
 * letters are sorted adjacently, with lowercase first.
 *
 * Returns:
 *   1 if b is case-insensitively greater-than-or-equal to a
 *  -1 otherwise.
 *
 * Public for testing.
 *
 * @public
 */
export const asciiSort = (a: number, b: number) => {
  // Normalize to lowercase for initial comparison
  let _a = a > 64 && a < 91 ? a + 32 : a;
  let _b = b > 64 && b < 91 ? b + 32 : b;
  // Case-insensitive comparison
  if (_a === _b) {
    return b < a ? -1 : 1;
  }
  // Characters differ, so ensure lowercase before uppercase
  return _a < _b ? -1 : 1;
};

/**
 * Returns a sorted list of the codes pointing to the next level of
 * the Trie.  Codes are sorted so that lowercase and uppercase
 *
 * The characters ['Q', 'x', 'A', 'q', 'a', 'x'] will sort as
 * ['a', 'A', 'q', 'Q', 'x', 'X'].
 */
const childCodes = (trie: Trie): number[] =>
  Object.keys(trie.children)
    .map((k) => +k)
    .sort(asciiSort);

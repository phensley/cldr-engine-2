/**
 * Trie scanning: enumerate every (key, value) entry of an ENCODED trie.
 *
 * The inverse of search-as-a-whole: search walks one path; scan walks
 * every path. Used by the runtime's family-delta merge (pack/decode.ts)
 * to materialize a merged trie: scan base entries + delta entries,
 * overlay, re-encode. The scan mirrors the node layout of encode.ts:
 *
 *   node = (data << 2) | type; LEAF / BRANCH / BRANCH_LEAF
 *   BRANCH:      chars at p+1;  (char, childOffset) pairs — child at
 *                k + nodes[k+1] + 1
 *   BRANCH_LEAF: value at p+1, chars at p+2
 *   LEAF:        value at p+1, suffix chars at p+2..p+1+data
 *
 * The encoder stores a node's chars sorted case-insensitively with
 * lowercase first (asciiSort), so scan order is sorted-key order for
 * uniform-case keys — re-encoding the scanned entries reproduces the
 * original structure (deterministic).
 */
import { Type } from './encode.js';

export interface TrieEntry {
  key: string;
  value: number;
}

/** Enumerate all entries of an encoded trie (sorted-key order for uniform-case keys). */
export const scanTrie = (nodes: number[]): TrieEntry[] => {
  const out: TrieEntry[] = [];
  const walk = (p: number, prefix: number[]): void => {
    const node = nodes[p] || 0;
    const type = node & 3;
    const data = node >> 2;
    if (type === Type.LEAF) {
      const suffix = nodes.slice(p + 2, p + 2 + data);
      out.push({ key: [...prefix, ...suffix].map((c) => String.fromCharCode(c)).join(''), value: nodes[p + 1] });
      return;
    }
    let charsStart: number;
    if (type === Type.BRANCH_LEAF) {
      out.push({ key: prefix.map((c) => String.fromCharCode(c)).join(''), value: nodes[p + 1] });
      charsStart = p + 2;
    } else {
      // BRANCH
      charsStart = p + 1;
    }
    for (let j = 0; j < data; j++) {
      const k = charsStart + (j << 1); // code slot; k+1 = child-offset slot
      const code = nodes[k];
      const child = k + 1 + nodes[k + 1] + 1;
      walk(child, [...prefix, code]);
    }
  };
  walk(0, []);
  return out;
};

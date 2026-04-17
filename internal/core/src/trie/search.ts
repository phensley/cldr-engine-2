import { Type } from './encode.js';

/**
 * Result of Trie search.
 */
export interface SearchResult {
  key: string;
  value: number;
}

/**
 * Case-insensitive Trie search.
 */
export const searchTrie = (key: string, nodes: number[]): SearchResult | undefined => {
  const path: number[] = [];
  const value = search(0, key, 0, nodes, path);
  return value !== -1 ? { key: path.map((c) => String.fromCharCode(c)).join(''), value } : undefined;
};

/**
 * Convert an ASCII uppercase character to lowercase.
 */
const lower = (c: number) => (c > 64 && c < 91 ? c + 32 : c);

/**
 * Case-insensitive comparison of two characters.
 */
const compare = (a: number, b: number): number => (a === b ? 1 : lower(a) === lower(b) ? 2 : 0);

/**
 * Perform a case-insensitive search that returns a single result.  If duplicate keys
 * are present in the Trie that are case-insensitively equal (e.g. "AAA" and "aaa"),
 * the first match will be returned, and this match will bias towards the exact-match
 * character.
 *
 * For example, if the Trie contains keys "aB" and "Ab" and the query is for "AB",
 * the search will first take the "A" branch, eventually reaching "b" and returning
 * "Ab" as the result.
 *
 * The `path` variable appends matched characters as the search traverses the Trie.
 */
const search = (i: number, key: string, p: number, nodes: number[], path: number[]): number => {
  const node = nodes[p] || 0;
  const type = node & 3;
  const data = node >> 2;

  switch (type) {
    case Type.LEAF: {
      // Attempt to match the leaf's suffix, if any.
      let j = 0;
      while (i < key.length && j < data) {
        const ch = key.charCodeAt(i);
        const orig = nodes[j + p + 2];
        if (!compare(ch, orig)) {
          return -1;
        }
        path.push(orig);
        i++;
        j++;
      }

      // Ensure we've exhausted all characters in the key and suffix.
      if (i === key.length && j === data) {
        return nodes[p + 1];
      }
      // Match failed, so unwind all suffix characters we appended.
      path.splice(0, j);
      return -1;
    }

    case Type.BRANCH_LEAF: {
      // If we've exhausted all characters in the key, we've matched the leaf.
      // Return the node's value.
      if (i === key.length) {
        return nodes[p + 1];
      }
      // Fall through and scan the branch.
    }

    case Type.BRANCH:
      // Fall through and scan the branch.
      break;

    default:
      // Unknown node type. Only reached if the array has been corrupted.
      return -1;
  }

  // Move pointer to the start of the character array based on the type of branch.
  p += type === Type.BRANCH ? 1 : 2;

  // Compare the current character to the array of characters stored at this level.
  // We collect up to 2 matches (lowercase and uppercase) and then search deeper on
  // those branches. We prefer the branch with an exact character match vs the
  // case-insensitive one.
  //
  // Linear scan for small arrays should match or beat binary search when factoring
  // in branching overhead. For our dataset (timezone identifiers), the Trie should
  // not have very high density below the root node, producing very short arrays at
  // each layer.
  const ch = key.charCodeAt(i);
  let match = 0;
  const hits: number[] = [-1, -1];
  for (let j = 0; j < data; j++) {
    let k = p + (j << 1);
    const orig = nodes[k];
    if (compare(ch, orig)) {
      // Prefer exact matches
      hits[ch === orig ? 0 : 1] = k;
      // We match a maximum of 2 characters: lowercase and uppercase.
      if (match) {
        break;
      }
      match++;
    }
  }

  for (let k of hits) {
    if (k === -1) {
      continue;
    }

    // Build the matched key as we traverse the trie
    path.push(nodes[k]);
    k++;

    // Search the next level using the next character.
    const res = search(i + 1, key, k + nodes[k] + 1, nodes, path);
    if (res !== -1) {
      return res;
    }

    // Unwind the failed match
    path.pop();
  }

  return -1;
};

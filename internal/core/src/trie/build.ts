export interface Trie {
  children: { [char: number]: Trie };
  value?: number;
  suffix: number[];
}

export const newTrie = (value?: number): Trie => ({ children: {}, value, suffix: [] });

/**
 * Add a key/value pair to the Trie.
 */
export const addKey = (trie: Trie, key: string, value: number) => {
  const klen = key.length;
  let i = 0;

  while (i < klen) {
    // Find child node using current character
    const c = key.charCodeAt(i);
    let child = trie.children[c];
    i++;

    if (!child) {
      // No child exists, so add a leaf node with the key's suffix at position `i`.
      child = newTrie();
      while (i < klen) {
        child.suffix.push(key.charCodeAt(i));
        i++;
      }
      child.value = value;
      trie.children[c] = child;
      return;
    }

    // We found a child node, check if the suffix matches.
    let j = i; // position in key
    let k = 0; // position in suffix
    let ok = true;
    const slen = child.suffix.length;
    while (j < klen && k < slen) {
      if (key.charCodeAt(j) !== child.suffix[k]) {
        ok = false;
        break;
      }
      k++;
      j++;
    }

    // Check if all characters have been compared in both key and node suffix.
    if (ok && j === klen && k === slen) {
      // Node matches exactly. Replace the value.
      child.value = value;
      return;
    }

    // We found a node but failed to match a suffix.
    // Check if the child node has a suffix and, if so, push one level deeper.
    if (slen > 0) {
      // Allocate a new node, value and suffix, and add to parent's child index
      const node = newTrie(child.value);
      node.suffix = child.suffix.slice(1);
      const code = child.suffix[0];
      child.children[code] = node;
      child.suffix = [];
      // If we're at the end of the key store the value, creating a branch node
      // which is also a leaf.
      child.value = i === klen ? value : undefined;
    }

    // Continue deeper.
    trie = child;
  }
};

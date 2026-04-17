/**
 * Test helper: enumerate all permutations of an array.
 *
 * RECONSTRUCTED: the original `permutation.ts` was missing from the source
 * repo (cldr-engine-ng); `trie/encode.test.ts` imported `permutations` from it.
 * Rebuilt from the call site contract:
 *
 *   permutations(perms, arr)  // appends all permutations of `arr` to `perms`
 *
 * The caller's array is not mutated; each appended permutation is a copy.
 */

export const permutations = <T>(perms: T[][], arr: T[]): void => {
  const a = [...arr];
  const permute = (l: number) => {
    if (l === a.length) {
      perms.push([...a]);
      return;
    }
    for (let i = l; i < a.length; i++) {
      [a[l], a[i]] = [a[i], a[l]];
      permute(l + 1);
      [a[l], a[i]] = [a[i], a[l]];
    }
  };
  permute(0);
};

/**
 * Test helper: enumerate all permutations of an array.
 *
 * Restored from the author's originals (2025-08-28); they were missing from
 * the old repo (cldr-engine-ng), so a reconstruction had briefly stood in.
 */

export const swap = <T>(arr: T[], i: number, j: number) => {
  let e = arr[i];
  arr[i] = arr[j];
  arr[j] = e;
};

export const permutations = <T>(res: T[][], arr: T[], index: number = 0) => {
  if (index === arr.length) {
    res.push([...arr]);
  }
  for (let i = index; i < arr.length; i++) {
    swap(arr, index, i);
    permutations(res, arr, index + 1);
    swap(arr, index, i);
  }
};

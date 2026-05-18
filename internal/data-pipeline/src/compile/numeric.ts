/**
 * Compile the locale-independent numeric table: keys array + GVE16 values.
 */
import type { NumericTable } from '../dataset/types.js';
import type { NumericPack } from '../pack/types.js';
import { packU16 } from './pool.js';

export const compileNumeric = (numeric: NumericTable): NumericPack => {
  if (numeric.keys.length !== numeric.values.length) {
    throw new Error(`numeric table is not parallel: ${numeric.keys.length} keys vs ${numeric.values.length} values`);
  }
  return {
    keys: [...numeric.keys],
    values: packU16(numeric.values),
  };
};

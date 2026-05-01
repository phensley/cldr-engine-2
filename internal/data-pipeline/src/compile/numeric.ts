/**
 * Compile the locale-independent numeric table: keys pool + GVE16 values.
 */
import type { NumericTable } from '../dataset/types.js';
import type { NumericPack, PoolCodec } from '../pack/types.js';
import { encodePool, packU16 } from './pool.js';

export const compileNumeric = (numeric: NumericTable, codec: PoolCodec): NumericPack => {
  if (numeric.keys.length !== numeric.values.length) {
    throw new Error(`numeric table is not parallel: ${numeric.keys.length} keys vs ${numeric.values.length} values`);
  }
  return {
    keys: encodePool(numeric.keys, codec),
    values: packU16(numeric.values),
  };
};

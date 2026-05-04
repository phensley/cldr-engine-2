/**
 * The pipeline entry: dataset → CompiledDataset (packs, one per locale).
 */
import type { Dataset } from '../dataset/types.js';
import type { LocalePack, NumericPack, PoolCodec } from '../pack/types.js';

/** Complete compile output: one LocalePack per locale + one NumericPack. */
export interface CompiledDataset {
  locale: Record<string, LocalePack>;
  numeric: NumericPack;
}
import { compileLocale } from './locale.js';
import { compileNumeric } from './numeric.js';

export interface CompileOptions {
  /** String-pool wire codec. Measured in S1-M4; utf8 is the working default. */
  poolCodec: PoolCodec;
}

export const compileDataset = (dataset: Dataset, opts: CompileOptions = { poolCodec: 'utf8' }): CompiledDataset => {
  const locale: Record<string, CompiledDataset['locale'][string]> = {};
  for (const [tag, data] of Object.entries(dataset.locales).sort()) {
    locale[tag] = compileLocale(data, opts.poolCodec);
  }
  return { locale, numeric: compileNumeric(dataset.numeric, opts.poolCodec) };
};

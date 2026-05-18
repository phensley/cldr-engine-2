/**
 * The pipeline entry: dataset → CompiledDataset (packs, one per locale).
 */
import type { Dataset } from '../dataset/types.js';
import type { LocalePack, NumericPack } from '../pack/types.js';
import { compileLocale } from './locale.js';
import { compileNumeric } from './numeric.js';

/** Complete compile output: one LocalePack per locale + one NumericPack. */
export interface CompiledDataset {
  locale: Record<string, LocalePack>;
  numeric: NumericPack;
}

export const compileDataset = (dataset: Dataset): CompiledDataset => {
  const locale: Record<string, LocalePack> = {};
  for (const [tag, data] of Object.entries(dataset.locales).sort()) {
    locale[tag] = compileLocale(data);
  }
  return { locale, numeric: compileNumeric(dataset.numeric) };
};

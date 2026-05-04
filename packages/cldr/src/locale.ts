/**
 * Locale resolution, shared across features (no per-feature Intl.*
 * re-resolution). v0: exact tag match, case-insensitive, canonicalized to
 * the configured tag. Subtag fallback (es → es-419) is a data-pipeline
 * concern for real CLDR, not this prototype.
 */
export const resolveLocale = <L extends string>(locale: string, available: readonly L[]): L => {
  const lowered = locale.toLowerCase();
  for (const tag of available) {
    if (tag.toLowerCase() === lowered) {
      return tag;
    }
  }
  throw new Error(`locale "${locale}" not found (available: ${available.join(', ') || 'none'})`);
};

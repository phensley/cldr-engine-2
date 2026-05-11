/**
 * Manifest v0 — hand-authored, alongside the reference implementation
 * (plans/prototype-plan.md §6). Maps every public feature slot to the
 * concrete implementation module the generator must import. The generated
 * client imports exactly these refs, so unselected slots never enter a
 * bundle; the AST-scan automation that replaces this is an S3+ item.
 *
 * Module → module transitive deps (e.g. currency/format → decimal
 * pattern formatter) are ordinary static imports in the impl modules, so
 * the bundler's graph follows them — the manifest only needs to know the
 * PUBLIC slots.
 */
export interface MethodRef {
  /** Package subpath specifier, e.g. '@phensley/cldr/decimal/compare'. */
  specifier: string;
  /** Named export of that module. */
  exportName: string;
}

export interface NamespaceSlot {
  namespace: Record<string, MethodRef>;
}

export type FeatureSlot = MethodRef | NamespaceSlot;

export interface FeatureManifest {
  /** Config keys → impl refs (true = whole surface / whole namespace). */
  slots: Record<string, FeatureSlot>;
  /** Pack streams this feature reads (informational, per-locale v0). */
  data: string[];
  /** True when the feature needs the locale's decoded pack. */
  needsLocaleData: boolean;
  /** Runtime factory the generated client assembles this feature with. */
  factory: 'makeDecimalFactory' | 'makeCurrencyFactory';
}

export interface Manifest {
  /** Every locale the runtime ships packs for (lazy mode maps ALL of them). */
  locales: readonly string[];
  features: Record<string, FeatureManifest>;
}

export const manifest: Manifest = {
  locales: ['en', 'fr', 'de', 'es-419'],
  features: {
    decimal: {
      factory: 'makeDecimalFactory',
      data: [],
      needsLocaleData: false,
      slots: {
        compare: { specifier: '@phensley/cldr/decimal/compare', exportName: 'compare' },
        min: { specifier: '@phensley/cldr/decimal/min', exportName: 'min' },
        max: { specifier: '@phensley/cldr/decimal/max', exportName: 'max' },
        movePoint: { specifier: '@phensley/cldr/decimal/move-point', exportName: 'movePoint' },
        format: {
          namespace: {
            scientific: { specifier: '@phensley/cldr/decimal/format/scientific', exportName: 'scientific' },
          },
        },
      },
    },
    currency: {
      factory: 'makeCurrencyFactory',
      data: ['currencies', 'patterns', 'pool'],
      needsLocaleData: true,
      slots: {
        format: { specifier: '@phensley/cldr/currency/format', exportName: 'format' },
        symbol: { specifier: '@phensley/cldr/currency/symbol', exportName: 'symbol' },
        fractionDigits: { specifier: '@phensley/cldr/currency/fraction-digits', exportName: 'fractionDigits' },
      },
    },
  },
};

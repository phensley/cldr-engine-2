/**
 * createCldr — the generated client's runtime (codegen-api-sketch §4/§5).
 *
 * Eager mode (lazy: false): every locale's pack is a static import; get()
 * is fully synchronous, zero runtime async.
 *
 * Lazy mode (lazy: true): packs are per-locale loader functions (the
 * generated file emits literal `() => import(...)` per known locale —
 * never an interpolated specifier). preload() is the single async seam:
 * idempotent, resolves the loader once; get() before preload throws a
 * clear error.
 *
 * `locales` is the only source of truth for resolution: get()/preload()
 * accept exactly the configured literal union (type-level), are
 * case-insensitive, and cache per locale.
 *
 * Cache-lifetime contract (plans/prototype-plan.md §12): ALL caches
 * (decoded packs, built contexts, preload state) are per-client — they
 * live inside this closure and die with the instance. No module-level
 * cache, no WeakRef, no eviction. Cross-instance safety is therefore
 * structural: a short-lived instance never observes another instance's
 * state. The generated client is a module-scope singleton by
 * construction, so per-client caches already have app lifetime in the
 * intended usage.
 */
import { decodeLocalePack, mergeVariantDelta } from '@cldr/internal-core';
import type { DecodedLocalePack, LocalePack, VariantDelta } from '@cldr/internal-core';
import { resolveLocale } from './locale.js';

/** A configured pack entry: a full locale pack or a family-variant delta. */
export type PackEntry = LocalePack | VariantDelta;

const isDelta = (e: PackEntry): e is VariantDelta => 'base' in e;

export interface CldrConfig<L extends string, C> {
  lazy: boolean;
  /** Configured locale tags; the generated client emits a literal list. */
  locales: readonly L[];
  /**
   * Eager: LocalePack per locale. Lazy: `() => import(...)` per locale.
   * Absent entirely when no selected feature needs locale data (a
   * decimal-only client ships zero pack bytes).
   */
  /**
   * Pack entries per tag — configured locales, plus any extra family
   * base tags the generator's layout selection injects (the base is
   * resolvable for delta merges but not part of the locale union).
   */
  packs?: Record<string, PackEntry | (() => Promise<PackEntry>)>;
  /** Assemble the per-locale feature namespace once, from decoded data. */
  build: (pack: DecodedLocalePack | undefined, locale: L) => C;
}

export interface Cldr<L extends string, C> {
  get(locale: L): C;
  preload(locale: L): Promise<void>;
}

export const createCldr = <L extends string, C>(config: CldrConfig<L, C>): Cldr<L, C> => {
  const decoded = new Map<L, DecodedLocalePack>();
  const contexts = new Map<L, C>();
  const loaded = new Set<L>();

  /** Decode-or-merge a tag's pack once (family deltas materialize here). */
  const ensureDecoded = (tag: L): DecodedLocalePack => {
    let d = decoded.get(tag);
    if (d !== undefined) {
      return d;
    }
    const entry = config.packs![tag] as PackEntry;
    d = isDelta(entry) ? mergeVariantDelta(ensureDecoded(entry.base as L), entry) : decodeLocalePack(entry as LocalePack);
    decoded.set(tag, d);
    return d;
  };

  /** Preload one tag's pack (async loader); deltas materialize against their base. */
  const doPreload = async (tag: L): Promise<void> => {
    if (config.packs === undefined || !config.lazy || loaded.has(tag)) {
      return; // eager: packs are static imports — the seam is a no-op
    }
    const entry = await (config.packs[tag] as () => Promise<PackEntry>)();
    loaded.add(tag);
    if (isDelta(entry)) {
      // a variant's base must be materialized first
      if (!decoded.has(entry.base as L)) {
        await doPreload(entry.base as L);
      }
      decoded.set(tag, mergeVariantDelta(decoded.get(entry.base as L)!, entry));
    } else {
      decoded.set(tag, decodeLocalePack(entry));
    }
  };

  return {
    get(locale: L): C {
      const tag = resolveLocale(locale, config.locales);
      if (config.lazy && !loaded.has(tag)) {
        throw new Error(`locale "${tag}" has not been preloaded — await cldr.preload("${tag}") first`);
      }
      let context = contexts.get(tag);
      if (context === undefined) {
        const d = config.packs === undefined ? undefined : ensureDecoded(tag);
        context = config.build(d, tag);
        contexts.set(tag, context);
      }
      return context;
    },
    preload: doPreload,
  };
};

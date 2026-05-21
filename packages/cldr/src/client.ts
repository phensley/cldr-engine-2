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
import { decodeLocalePack } from '@cldr/internal-core';
import type { DecodedLocalePack, LocalePack } from '@cldr/internal-core';
import { resolveLocale } from './locale.js';

export interface CldrConfig<L extends string, C> {
  lazy: boolean;
  /** Configured locale tags; the generated client emits a literal list. */
  locales: readonly L[];
  /**
   * Eager: LocalePack per locale. Lazy: `() => import(...)` per locale.
   * Absent entirely when no selected feature needs locale data (a
   * decimal-only client ships zero pack bytes).
   */
  packs?: Record<L, LocalePack | (() => Promise<LocalePack>)>;
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

  return {
    get(locale: L): C {
      const tag = resolveLocale(locale, config.locales);
      if (config.lazy && !loaded.has(tag)) {
        throw new Error(`locale "${tag}" has not been preloaded — await cldr.preload("${tag}") first`);
      }
      let context = contexts.get(tag);
      if (context === undefined) {
        let d: DecodedLocalePack | undefined = decoded.get(tag);
        if (d === undefined && config.packs !== undefined) {
          d = decodeLocalePack(config.packs[tag] as LocalePack);
          decoded.set(tag, d);
        }
        context = config.build(d, tag);
        contexts.set(tag, context);
      }
      return context;
    },
    async preload(locale: L): Promise<void> {
      const tag = resolveLocale(locale, config.locales);
      if (config.packs === undefined || !config.lazy || loaded.has(tag)) {
        return;
      }
      const loader = config.packs[tag] as () => Promise<LocalePack>;
      decoded.set(tag, decodeLocalePack(await loader()));
      loaded.add(tag);
    },
  };
};

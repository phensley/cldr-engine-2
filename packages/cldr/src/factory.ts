/**
 * makeDecimalFactory — assembles a Decimal factory from the selected method
 * functions (alt-api-sketch's vtable approach, materialized for the
 * generated client).
 *
 * The emitted client passes only what the config selected — unselected
 * methods are never imported, so nothing of them lands in a bundle. One
 * frozen vtable is shared by every instance; namespaces (format.*) get a
 * per-instance wrapper object so their methods can reach the instance's
 * state via __owner (the same back-reference rule as the sketch: any node
 * containing a `new` leaf is instantiable; anything deeper is a
 * sub-namespace).
 */
import type { DecimalInstance, DecimalSelection } from './api.js';
import type { CalendarInstance, CalendarSelection, CalendarState, CurrencyInstance, CurrencySelection, PluralInstance, PluralSelection, PluralState } from './api.js';
import type { DecodedLocalePack, DecodedZonesTable } from '@cldr/internal-core';
import { parseDecimal } from './decimal/state.js';
import type { DecimalArg, DecimalState } from './decimal/state.js';
import type { CurrencyState } from './currency/state.js';

type AnyFn = (state: unknown, ...args: unknown[]) => unknown;

const isState = (r: unknown): r is DecimalState =>
  typeof r === 'object' && r !== null && 'coeff' in r && Array.isArray((r as DecimalState).coeff);

export const makeDecimalFactory = <M extends DecimalSelection>(selected: M) => {
  let makeInstance!: (state: DecimalState) => DecimalInstance<M>;

  const namespaceKeys: string[] = [];
  const top: Record<string, unknown> = {};

  for (const [key, slot] of Object.entries(selected)) {
    if (typeof slot === 'function') {
      const fn = slot as AnyFn;
      top[key] = function (this: { __i: DecimalState }, ...args: unknown[]) {
        const r = fn(this.__i, ...args);
        return isState(r) ? makeInstance(r) : r;
      };
    } else if (slot !== undefined) {
      // namespace node (format.*)
      const nsMethods: Record<string, unknown> = {};
      for (const [nk, nfn] of Object.entries(slot as object)) {
        nsMethods[nk] = function (this: { __owner: { __i: DecimalState } }, ...args: unknown[]) {
          return (nfn as AnyFn)(this.__owner.__i, ...args);
        };
      }
      Object.freeze(nsMethods);
      namespaceKeys.push(key);
      top[key] = nsMethods;
    }
  }
  Object.freeze(top);

  makeInstance = (state: DecimalState): DecimalInstance<M> => {
    const inst = Object.create(top) as Record<string, unknown> & { __i: DecimalState };
    Object.defineProperty(inst, '__i', { value: state, enumerable: false, writable: true });
    for (const key of namespaceKeys) {
      // per-instance namespace wrapper so nested methods reach this instance
      Object.defineProperty(inst, key, { value: Object.assign(Object.create(top[key] as object), { __owner: inst }), enumerable: true });
    }
    return inst as unknown as DecimalInstance<M>;
  };

  return {
    new: (raw: DecimalArg): DecimalInstance<M> => makeInstance(parseDecimal(raw)),
  };
};

/**
 * makeCurrencyFactory — assembles a Currency factory per locale from the
 * selected method functions. `pack` is the locale's decoded pack; the
 * client caches one factory per (locale × selection).
 */
export const makeCurrencyFactory = <M extends CurrencySelection>(pack: DecodedLocalePack, selected: M) => {
  const top: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(selected)) {
    if (typeof fn === 'function') {
      top[key] = function (this: { __s: CurrencyState }, ...args: unknown[]) {
        return (fn as AnyFn)(this.__s, ...args);
      };
    }
  }
  Object.freeze(top);

  return {
    new: (amount: DecimalArg, code: string): CurrencyInstance<M> => {
      const inst = Object.create(top) as Record<string, unknown> & { __s: CurrencyState };
      Object.defineProperty(inst, '__s', {
        value: { pack, amount: parseDecimal(amount), code } satisfies CurrencyState,
        enumerable: false,
        writable: true,
      });
      return inst as unknown as CurrencyInstance<M>;
    },
  };
};

/**
 * makePluralFactory — assembles a Plural factory per locale from the
 * selected method functions (same shape as the currency factory: `pack`
 * carries the decoded plural rules; instances hold { pack, amount }).
 */
export const makePluralFactory = <M extends PluralSelection>(pack: DecodedLocalePack, selected: M) => {
  const top: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(selected)) {
    if (typeof fn === 'function') {
      top[key] = function (this: { __s: PluralState }, ...args: unknown[]) {
        return (fn as AnyFn)(this.__s, ...args);
      };
    }
  }
  Object.freeze(top);

  return {
    new: (amount: DecimalArg): PluralInstance<M> => {
      const inst = Object.create(top) as Record<string, unknown> & { __s: PluralState };
      Object.defineProperty(inst, '__s', {
        value: { pack, amount: parseDecimal(amount) } satisfies PluralState,
        enumerable: false,
        writable: true,
      });
      return inst as unknown as PluralInstance<M>;
    },
  };
};

/**
 * makeCalendarFactory — assembles a Calendar factory per locale from the
 * selected method functions. Instances hold { pack, zones, date }: the
 * zones table is the shared offset companion (unit+offset numeric
 * header), captured at assembly from the generated client.
 */
export const makeCalendarFactory = <M extends CalendarSelection>(pack: DecodedLocalePack, zones: DecodedZonesTable, selected: M) => {
  const top: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(selected)) {
    if (typeof fn === 'function') {
      top[key] = function (this: { __s: CalendarState }, ...args: unknown[]) {
        return (fn as AnyFn)(this.__s, ...args);
      };
    }
  }
  Object.freeze(top);

  return {
    new: (date: Date): CalendarInstance<M> => {
      const inst = Object.create(top) as Record<string, unknown> & { __s: CalendarState };
      Object.defineProperty(inst, '__s', {
        value: { pack, zones, date } satisfies CalendarState,
        enumerable: false,
        writable: true,
      });
      return inst as unknown as CalendarInstance<M>;
    },
  };
};

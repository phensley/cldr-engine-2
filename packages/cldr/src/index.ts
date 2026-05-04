/**
 * @phensley/cldr — runtime (S2 prototype).
 *
 * Public surface: fixed API shapes (api.ts), the factory that assembles
 * selected methods into instances (factory.ts), and the generated-client
 * runtime (client.ts, S2-M2). Per-method implementation modules live at
 * subpaths (decimal/*, currency/*) — exactly what the generated client
 * imports, so only selected methods enter a bundle.
 */
export * from './api.js';
export { makeCurrencyFactory, makeDecimalFactory } from './factory.js';
export { createCldr } from './client.js';
export type { Cldr, CldrConfig } from './client.js';

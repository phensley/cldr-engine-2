/**
 * @cldr/data-pipeline — compiles mini-cldr datasets into pack assets.
 *
 * Chain: dataset → trie/pool compilation → GVE16 → X85 → pack TS modules
 * (one per locale, see scripts/generate-packs.ts).
 */
export * from './dataset/types.js';
export { miniCldr } from './dataset/index.js';
export * from './pack/types.js';
export * from './pack/decode.js';
export * from './compile/index.js';
export * from './compile/pool.js';
export * from './emit.js';

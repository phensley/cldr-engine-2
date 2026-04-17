/**
 * @cldr/data-pipeline — compiles mini-cldr datasets into pack assets.
 *
 * Chain: dataset → trie/pool compilation → GVE16 → X85 → pack TS modules
 * (one per locale). The compile step lands with the pack format (S1-M3);
 * today this package exports the dataset input contract the compile step
 * is built against.
 */
export * from './dataset/types.js';

/**
 * Dependency rules for the four-package layout (plans/packaging-sketch.md):
 *
 *  - internal/core is a true leaf: it may only import its own files.
 *  - nothing outside internal/data-pipeline may import it (its output is
 *    consumed as build artifacts only, never as a module).
 *  - the public packages may import core (inlined at build) and cldr-
 *    generate may import the runtime's manifest subpath.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-is-a-leaf',
      comment: 'internal/core must import nothing outside itself (no packages, no other workspace dirs)',
      from: { path: '^internal/core/src' },
      to: { pathNot: '^\\.', pathNot: '^internal/core/src' },
      severity: 'error',
    },
    {
      name: 'data-pipeline-is-output-only',
      comment: 'importing @cldr/data-pipeline as a module is forbidden outside itself — the runtime consumes its build output, never its source',
      from: { pathNot: '^internal/data-pipeline' },
      to: { path: '^internal/data-pipeline' },
      severity: 'error',
    },
    {
      name: 'generator-imports-runtime-manifest-only',
      comment: 'cldr-generate may only reach into the runtime via the manifest subpath (and core types)',
      from: { path: '^packages/cldr-generate/src' },
      to: {
        path: '^packages/cldr/src',
        pathNot: '^packages/cldr/src/manifest\\.ts$|^packages/cldr/src/manifest',
        pathNot: '^\\.',
      },
      severity: 'error',
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
  },
};

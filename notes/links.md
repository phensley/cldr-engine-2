# Modularization

Trying to avoid the entire library being async. Ideally we could generate a single file that wires up the required dependencies based on the user's desired features and configuration.

- Use multiple entry points https://stackoverflow.com/questions/54392809/how-do-i-handle-optional-peer-dependencies-when-publishing-a-typescript-package
- Entry points https://nodejs.org/docs/latest-v16.x/api/packages.html#package-entry-points

# Bundlers

- esbuild https://esbuild.github.io/getting-started/#your-first-bundle
- tsup https://github.com/egoist/tsup

# Tree-shaking

- https://blog.theodo.com/2021/04/library-tree-shaking/

# Private fields

- Pattern used to create internally-accessible private fields https://github.com/microsoft/TypeScript/pull/30829
  - This allows us to split classes up into modules where you can omit a group of methods you never use.

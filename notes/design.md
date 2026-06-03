# Design

- Use entry points to expose granular parts of the library that tree-shaking can prune
  - https://cube.dev/blog/how-to-build-tree-shakeable-javascript-libraries
- Use compiler to:
  - generate resource packs based on configuration
  - generate a cldr.ts file that imports the expected parts of the library along with the needed data blobs
- Change loading to do no implicit work, it just expects a language id and loads the related resource pack. The language tag should be even more bare-bones, and locale resolution and mapping should be excluded unless explicitly requested.
- This means that a locale identifier is expected to be exact

## Modularization

- Develop a specification for all functionality, for each visible type and its exported methods, and dependencies between them. This dependency map is then used to wire up the final library based on the configuration of which top-level features are needed.
- We annotate each method with which external features they depend on. This can then be scanned to determine the final set of features needed, which is used to produce the top-level imports.

## Types

- Modularize the types so that each public or private method is in its own file with dependencies explicitly expressed
- Each public method has a type fragment file that extends the public types.

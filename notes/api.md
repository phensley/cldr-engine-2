# Design

Redesign the cldr-engine API with the following criteria in mind:

- Minimization of dependency on embedded static data.
  - Move functions requiring this data to an optional method wherever possible
- Modularity of all functionality
  - Classes have optional methods (using our invented pattern)
  - Compiler can generate the correct list of imports based on users desired feature configuration
- Resource packs as dynamic TS imports (?)
  - Option to allow the bundler/loader to resolve references to language-specific data like resource packs
- Bundle loader more modular
  - Allow use of dynamic import instead of explicit loading via Promise
  - This forces an async pattern to resolve and construct the CLDR instance

# S2 bundle table — config × bundle size (esbuild)

Configs: decimal-only/en (eager), currency/en+fr (eager), all/4-locales (eager), all-lazy. Bundled with esbuild (browser, esm), gz = gzip of output. Absence assertions asserted in-script.

| config | bundle bytes | gz | files | inputs | packs in graph |
| --- | --- | --- | --- | --- | --- |
| decimal-only-en | 17084 | 5202 | 1 | 17 | — |
| plural-en | 56859 | 25204 | 1 | 15 | — |
| calendar-en | 68214 | 28775 | 1 | 19 | — |
| currency-en-fr | 97684 | 44107 | 1 | 19 | — |
| all-4-eager | 180375 | 83985 | 1 | 26 | — |
| family-en-eager | 78851 | 33495 | 1 | 22 | — |
| all-lazy | 341964 | 151222 | 12 | 33 | — |

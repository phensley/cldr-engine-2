# S3 publish round-trip record

_Recorded 2026-08-30T23:42:09.001Z_ — consumer: `/var/folders/gm/3nsdm55n1jj0ylwft02tsf1r0000gp/T/cldr-roundtrip-7KDuzE` (isolated tmpdir, installed from local verdaccio).

| step | result |
| --- | --- |
| publish `@phensley/cldr` + `@phensley/cldr-generate` → verdaccio | ✓ |
| consumer `npm install` (registry-only) | ✓ |
| published CLI → `cldr.gen.ts` | ✓ |
| `tsc` NodeNext resolution (skipLibCheck off) | ✓ |
| `tsc` bundler resolution (skipLibCheck off) | ✓ |
| esbuild browser bundle | ✓ |
| bundle parity vs workspace symlinks | 166196 B vs 166089 B (drift 0.1%) |
| bundle rerun in node = dev output | `$1,234.50 / 9.9e-1 / -1` |
| `./manifest` browser-blocked / node-resolved | ✓ / ✓ |
| installed dist private-import scan | clean |

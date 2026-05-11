/**
 * Consumer-authored config (lazy/open locale set): the generator emits a
 * literal `() => import(...)` map for every locale the runtime ships.
 */
import { defineConfig } from '@phensley/cldr-generate';

export default defineConfig({
  locales: { lazy: true },
  features: {
    decimal: { min: true, format: { scientific: true } },
    currency: true,
  },
});

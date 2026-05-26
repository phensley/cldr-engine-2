/**
 * Consumer-authored config (eager, fixed locale set).
 */
import { defineConfig } from '@phensley/cldr-generate';

export default defineConfig({
  locales: ['en', 'en-GB', 'de', 'fr'],
  features: {
    decimal: { compare: true, min: true, format: { scientific: true } },
    currency: true,
  },
});

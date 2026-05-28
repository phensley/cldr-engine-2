/**
 * Consumer-authored config (eager, fixed locale set).
 */
import { defineConfig } from '@phensley/cldr-generate';

export default defineConfig({
  locales: ['en', 'en-GB', 'de', 'fr', 'ar'],
  features: {
    decimal: { compare: true, min: true, format: { scientific: true } },
    currency: true,
    plural: true,
    calendar: { format: true, monthName: true, weekdayName: true, firstDay: true, offset: true },
  },
});

/**
 * Smoke test of the COMMITTED generated client: it must typecheck under
 * this repo's strict config, run synchronously (eager), resolve the
 * narrowed locale union, and match the dataset.
 */
import { describe, expect, it } from 'vitest';
import { cldr } from '../src/cldr.gen.js';

describe('generated eager client (examples/eager-app)', () => {
  it('is synchronous and resolves configured locales', () => {
    expect(cldr.get('en').currency.new('1234.5', 'USD').format()).toBe('$1,234.50');
    expect(cldr.get('de').currency.new('5', 'MXN').symbol()).toBe('MX$');
    // en-GB is a family variant: its pack is materialized from the en-001 base + delta
    expect(cldr.get('en-GB').currency.new('1234.5', 'USD').format()).toBe('US$1,234.50');
    expect(cldr.get('en-GB').currency.new('5', 'GBP').symbol()).toBe('£');
    expect(cldr.get('en').plural.new('1').select()).toBe('one');
    expect(cldr.get('en').plural.new('2').select()).toBe('other');
    expect(cldr.get('ar').plural.new('3').select()).toBe('few');
    expect(cldr.get('en').calendar.new(new Date('2025-03-04T12:00:00Z')).format()).toBe('Tuesday, March 4, 2025');
    expect(cldr.get('en-GB').calendar.new(new Date('2025-03-04T12:00:00Z')).format('short')).toBe('04/03/2025');
    expect(cldr.get('en').calendar.new(new Date('2025-01-15T12:00:00Z')).offset('America/New_York')).toBe('-05:00');
    expect(cldr.get('fr').currency.new('1234.5', 'EUR').format()).toBe('1\u202f234,50\u00a0€');
    expect(cldr.get('en').decimal.new('1.5').format.scientific()).toBe('1.5e+0');
    expect(cldr.get('en').decimal.new('2').min(1).compare('1')).toBe(0);
  });

  it('narrows locale to the configured union (compile-time)', () => {
    const rejectUnconfigured = () => {
      // @ts-expect-error — 'zh' is not configured
      cldr.get('zh');
    };
    void rejectUnconfigured;
    const tags: ('en' | 'en-GB' | 'de' | 'fr' | 'ar')[] = ['en', 'fr'];
    expect(cldr.get(tags[1]).currency.new('1', 'EUR').fractionDigits()).toBe(2);
  });

  it('is regenerable: committed file matches a fresh generate()', async () => {
    const { readFileSync } = await import('node:fs');
    const { generate } = await import('@phensley/cldr-generate');
    const config = (await import('../cldr.config.js')).default;
    expect(readFileSync(new URL('../src/cldr.gen.ts', import.meta.url), 'utf8')).toBe(generate(config));
  });
});

/**
 * Full-universe coverage test (cache-gated): the full 766-locale compile
 * (generate-packs:full) must reproduce the committed coverage anchor
 * (deterministic compiler + sha-pinned cldr-json input; the anchor
 * catches compiler drift — 'pnpm generate:packs:full' regenerates it
 * intentionally). Also smoke-decodes every pack.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compileDataset, decodeLocalePack, lookupTrieValue, renderLocaleModule } from '../src/index.js';
import { realCldr } from '../src/dataset/real.js';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.cache', 'cldr', '48.2.1');
const hasCache = existsSync(join(cacheDir, 'cldr-numbers-full', 'main', 'en', 'numbers.json'));
const ANCHOR = join(dirname(fileURLToPath(import.meta.url)), '../generated/coverage.sha256');

describe.skipIf(!hasCache)('full universe (766 locales)', () => {
  const compiled = compileDataset(realCldr({ full: true }));

  test('every cached locale compiles (766)', () => {
    expect(Object.keys(compiled.locale).length).toBeGreaterThanOrEqual(766);
    for (const tag of ['ja', 'pt', 'tr', 'he', 'th', 'ko', 'uk', 'vi', 'id', 'pl']) {
      expect(compiled.locale[tag], tag).toBeDefined();
    }
  });

  test('deterministic: aggregate hash equals the committed coverage anchor', () => {
    const aggregate = Object.keys(compiled.locale)
      .sort()
      .map((tag) => renderLocaleModule(tag, compiled.locale[tag]))
      .join('\n');
    const sha = createHash('sha256').update(aggregate).digest('hex');
    const anchor = readFileSync(ANCHOR, 'utf8').trim();
    expect(sha, `coverage anchor stale — run pnpm generate:packs:full (anchor: ${anchor})`).toBe(anchor);
  });

  test('every full pack decodes; spot lookups resolve', () => {
    for (const [tag, pack] of Object.entries(compiled.locale)) {
      const d = decodeLocalePack(pack);
      expect(d.pool.length, `${tag} pool`).toBeGreaterThan(0);
    }
    const ja = decodeLocalePack(compiled.locale['ja']);
    expect(ja.pool[lookupTrieValue('JP', ja.territoryTrie)!]).toBe('日本');
    const pt = decodeLocalePack(compiled.locale['pt']); // CLDR 48: 'pt' IS Brazilian
    expect(pt.calendar.names.monthsWide[0]).toBe('janeiro');
    const th = decodeLocalePack(compiled.locale['th']);
    expect(th.pool[lookupTrieValue('TH', th.territoryTrie)!]).toBe('ไทย');
  });
});

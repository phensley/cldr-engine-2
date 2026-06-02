/**
 * Fetch the pinned CLDR cldr-json slice for the pipeline.
 *
 *   pnpm fetch:cldr
 *
 * Downloads the unicode-org/cldr-json GitHub release zip for the pinned
 * version, verifies it against the recorded SHA-256 (pinned once after
 * the first verified download — later fetches are tamper-evident), and
 * extracts EVERY locale's files for the seven per-locale data classes
 * plus the core supplementals:
 *
 *   - per-locale: numbers, currencies, languages, scripts, territories,
 *     ca-gregorian, timeZoneNames (every locale under each package)
 *   - cldr-core/supplemental/{currencyData,numberingSystems,plurals,
 *     ordinals,weekData,parentLocales,likelySubtags}.json
 *
 * Output lands in .cache/cldr/<version>/ (gitignored — the tree stays
 * clean; regenerate on demand). ~5,400 files; the FULL locale universe
 * (766) is what the publish-time pack generation consumes; the committed
 * 11-locale subset is the regression corpus.
 *
 * Requires: system `unzip`, network on first fetch.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '48.2.1';
const URL = `https://github.com/unicode-org/cldr-json/releases/download/${VERSION}/cldr-${VERSION}-json-full.zip`;

/** SHA-256 of the pinned release zip (pinned here once the first download is verified). */
const PINNED_SHA256 = '6435a529c9be2f9cbc57ba9d0e577c9c4aca90c109bb7156a4f057dfaf2a626f';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'cldr', VERSION);
const ZIP = join(CACHE, `cldr-${VERSION}-json-full.zip`);
const MANIFEST = join(CACHE, 'manifest.json');

/** Per-locale extraction globs (unzip wildcards). */
const LOCALE_GLOBS = [
  'cldr-numbers-full/main/*/numbers.json',
  'cldr-numbers-full/main/*/currencies.json',
  'cldr-localenames-full/main/*/languages.json',
  'cldr-localenames-full/main/*/scripts.json',
  'cldr-localenames-full/main/*/territories.json',
  'cldr-dates-full/main/*/ca-gregorian.json',
  'cldr-dates-full/main/*/timeZoneNames.json',
];

const CORE_FILES = [
  'cldr-core/supplemental/currencyData.json',
  'cldr-core/supplemental/numberingSystems.json',
  'cldr-core/supplemental/plurals.json',
  'cldr-core/supplemental/ordinals.json',
  'cldr-core/supplemental/weekData.json',
  'cldr-core/supplemental/parentLocales.json',
  'cldr-core/supplemental/likelySubtags.json',
];

const sha256 = (buf: Uint8Array | Buffer): string => createHash('sha256').update(buf).digest('hex');

/** All zip members matching the globs (deterministic order). */
const zipMembers = (): string[] => {
  const listing = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const members = listing.trim().split('\n');
  const wanted = new Set([...CORE_FILES]);
  for (const glob of LOCALE_GLOBS) {
    const re = new RegExp(`^${glob.replace(/\./g, '\\.').replace(/\*/g, '[^/]+')}$`);
    for (const m of members) {
      if (re.test(m)) {
        wanted.add(m);
      }
    }
  }
  return [...wanted].sort();
};

/** Locale codes for a package dir (sorted). */
export const cachedLocales = (): string[] => {
  const dir = join(CACHE, 'cldr-numbers-full', 'main');
  return existsSync(dir) ? readdirSyncSafe(dir).filter((d) => d !== 'root').sort() : [];
};
import { readdirSync } from 'node:fs';
const readdirSyncSafe = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

const download = async (): Promise<void> => {
  console.log(`fetch-cldr: downloading ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);
  console.log(`fetch-cldr: downloaded ${buf.length} bytes, sha256=${hash}`);
  writeFileSync(ZIP, buf);
  if (hash !== PINNED_SHA256) {
    throw new Error(`downloaded zip hash mismatch: expected ${PINNED_SHA256}, got ${hash} — UPDATE PINNED_SHA256`);
  }
};

const ensureZip = async (): Promise<void> => {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(ZIP)) {
    await download();
    return;
  }
  const actual = sha256(readFileSync(ZIP));
  if (actual !== PINNED_SHA256) {
    throw new Error(`zip hash mismatch: expected ${PINNED_SHA256}, got ${actual} — delete ${ZIP} and re-fetch`);
  }
  console.log('fetch-cldr: zip present, hash verified');
};

const extract = (): void => {
  // unzip's own wildcards: 14 arguments, not 5,400 (argv limits)
  const patterns = [...LOCALE_GLOBS, ...CORE_FILES];
  console.log(`fetch-cldr: extracting via ${patterns.length} patterns…`);
  execFileSync('unzip', ['-o', '-q', ZIP, ...patterns, '-d', CACHE], { stdio: 'inherit' });
  const byGlob: Record<string, number> = {};
  for (const glob of LOCALE_GLOBS) {
    const re = new RegExp(`^${glob.replace(/\./g, '\\.').replace(/\*/g, '[^/]+')}$`);
    byGlob[glob] = zipMembers().filter((m) => re.test(m)).length;
  }
  const extracted = zipMembers().filter((m) => existsSync(join(CACHE, m))).length;
  if (extracted < zipMembers().length) {
    throw new Error(`extract incomplete — ${zipMembers().length - extracted} members missing`);
  }
  writeFileSync(
    MANIFEST,
    JSON.stringify({ version: VERSION, extracted, byGlob, locales: cachedLocales().length, sha256: PINNED_SHA256 }, null, 2),
  );
  console.log(`fetch-cldr: extracted ${extracted} files (${cachedLocales().length} locales): ${Object.values(byGlob).join(', ')}`);
};

await ensureZip();
const prev = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { extracted?: number }).extracted : undefined;
const want = zipMembers().length;
if (prev !== want) {
  extract();
} else {
  console.log('fetch-cldr: extraction already complete — done');
}

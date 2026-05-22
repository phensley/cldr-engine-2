/**
 * Fetch the pinned CLDR cldr-json subset for the real-data pack
 * validation (prototype-plan §11b follow-up 2).
 *
 *   pnpm fetch:cldr
 *
 * Downloads the unicode-org/cldr-json GitHub release zip for the pinned
 * version, verifies it against the recorded SHA-256 (trust-on-first-use:
 * the hash is pinned into the source after the first download, so later
 * fetches are tamper-evident), and extracts ONLY the locale/supplemental
 * files the benchmark needs:
 *
 *   - cldr-localenames-full/main/<loc>/{languages,scripts,territories}.json
 *   - cldr-numbers-full/main/<loc>/{numbers,currencies}.json
 *   - cldr-core/supplemental/currencyData.json
 *
 * Locales: en, en-001, en-GB, en-AU, en-CA (the en family) + fr, de
 * (cross-family) + zh, ar, hi, ru (CJK/Arabic/Devanagari/Cyrillic
 * script coverage). CLDR 48 cldr-json ships FULLY RESOLVED per-locale
 * data (no parent-chain walking — verified: en-GB carries all 316
 * territory codes), so per-locale diffs are real divergence, not
 * inheritance artifacts.
 *
 * Output lands in .cache/cldr/<version>/ (gitignored — the tree stays
 * clean; regenerate on demand). Benchmark: scripts/benchmark-real.ts
 * (pnpm benchmark:real), which reads this cache.
 *
 * Requires: system `unzip`, network on first fetch.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const VERSION = '48.2.1';
const URL = `https://github.com/unicode-org/cldr-json/releases/download/${VERSION}/cldr-${VERSION}-json-full.zip`;

/** SHA-256 of the pinned release zip (pinned here once the first download is verified). */
const PINNED_SHA256 = '6435a529c9be2f9cbc57ba9d0e577c9c4aca90c109bb7156a4f057dfaf2a626f';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'cldr', VERSION);
const ZIP = join(CACHE, `cldr-${VERSION}-json-full.zip`);
const MANIFEST = join(CACHE, 'manifest.json');

const LOCALES = ['en', 'en-001', 'en-GB', 'en-AU', 'en-CA', 'fr', 'de', 'zh', 'ar', 'hi', 'ru'];

/** Paths (inside the zip) we extract. */
const FILES = [
  'cldr-core/supplemental/currencyData.json',
  'cldr-core/supplemental/numberingSystems.json',
  ...LOCALES.flatMap((l) => [
    `cldr-localenames-full/main/${l}/languages.json`,
    `cldr-localenames-full/main/${l}/scripts.json`,
    `cldr-localenames-full/main/${l}/territories.json`,
    `cldr-numbers-full/main/${l}/numbers.json`,
    `cldr-numbers-full/main/${l}/currencies.json`,
  ]),
];

const sha256 = (buf: Uint8Array | Buffer): string => createHash('sha256').update(buf).digest('hex');

const download = async (): Promise<void> => {
  console.log(`fetch-cldr: downloading ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);
  console.log(`fetch-cldr: downloaded ${buf.length} bytes, sha256=${hash}`);
  console.log(`fetch-cldr: PIN this hash in scripts/fetch-cldr-data.ts (PINNED_SHA256 = '${hash}')`);
  writeFileSync(ZIP, buf);
};

const ensureZip = async (): Promise<void> => {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(ZIP)) {
    const actual = sha256(readFileSync(ZIP));
    if (PINNED_SHA256 === null) {
      console.log(`fetch-cldr: zip present (sha256 ${actual}) — no pin recorded yet; trusting existing file.`);
      return;
    }
    if (actual !== PINNED_SHA256) {
      throw new Error(`zip hash mismatch: expected ${PINNED_SHA256}, got ${actual} — delete ${ZIP} and re-fetch`);
    }
    console.log('fetch-cldr: zip present, hash verified');
    return;
  }
  if (PINNED_SHA256 !== null) {
    // Pinned but missing — download and verify against the pin.
    await download();
    const actual = sha256(readFileSync(ZIP));
    if (actual !== PINNED_SHA256) {
      throw new Error(`downloaded zip hash mismatch: expected ${PINNED_SHA256}, got ${actual}`);
    }
    console.log('fetch-cldr: downloaded zip hash verified against pin');
    return;
  }
  await download();
};

const extract = (): void => {
  const patterns = FILES;
  console.log(`fetch-cldr: extracting ${patterns.length} files…`);
  execFileSync('unzip', ['-o', '-q', ZIP, ...patterns, '-d', CACHE], { stdio: 'inherit' });
  const written = FILES.map((f) => join(CACHE, f)).filter((p) => existsSync(p));
  if (written.length !== FILES.length) {
    const missing = FILES.filter((f) => !existsSync(join(CACHE, f)));
    throw new Error(`extract incomplete — missing: ${missing.join(', ')} (zip layout changed?)`);
  }
  writeFileSync(
    MANIFEST,
    JSON.stringify({ version: VERSION, zipSha256: PINNED_SHA256 ?? sha256(readFileSync(ZIP)), files: written.map((p) => p.slice(CACHE.length + 1)) }, null, 2),
  );
  console.log(`fetch-cldr: extracted ${written.length} files under ${CACHE}`);
};

await ensureZip();
const missing = FILES.filter((f) => !existsSync(join(CACHE, f)));
if (missing.length > 0) {
  extract();
} else {
  console.log('fetch-cldr: extraction already present — done');
}

/**
 * CLI entry: cldr-generate --config cldr.config.ts [--out src/cldr.gen.ts]
 *
 * The config module's default export must be the object produced by
 * defineConfig (or shaped like it).
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeClient } from './index.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const configPath = flag('config');
if (configPath === undefined) {
  console.error('usage: cldr-generate --config cldr.config.ts [--out src/cldr.gen.ts]');
  process.exit(1);
}

const url = pathToFileURL(resolve(configPath));
const mod = (await import(url.href)) as { default?: unknown };
const config = mod.default;
if (config === undefined || typeof config !== 'object') {
  console.error(`config at ${configPath} does not default-export a config object`);
  process.exit(1);
}

const out = flag('out', 'src/cldr.gen.ts')!;
const code = writeClient(config as Parameters<typeof writeClient>[0], out);
console.log(`generated ${out} (${code.length} bytes)`);

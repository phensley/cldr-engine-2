/**
 * 1.x parity harness — Tier 1 (plans/real-cldr-compiler.md decision 4).
 *
 * Cross-implementation validation against the 1.x engine's COMPILED
 * output (its own repo, not this one): the 1.x compiler's
 * `currencyFractionsRaw` (packages/cldr-core/src/internals/numbers/
 * autogen.currencies.ts, CLDR 48.2.0) vs the 2.x pipeline's fraction
 * digits derived from cldr-json 48.2.1 currencyData. The same ISO 4217
 * fact (digits per code) compiled by two independent pipelines — exact
 * agreement expected; a CLDR patch difference (48.2.0 → 48.2.1) is the
 * only legitimate drift source.
 *
 * Machine/version-gated: requires the 1.x checkout (CLDR1X_ROOT env >
 * default ~/dev/projects/cldr-engine); skipped when absent. The parsing
 * reads the compiled TS artifact, NOT 1.x code — no 1.x runtime runs.
 *
 * Tier 2 (recorded, not built): per-field pack-value parity (territory
 * names/symbols/patterns) requires executing the 1.x mapping-DSL
 * decoder against the compiled en pack — a port worth doing when the
 * full locale set lands; our frozen-value tests already anchor values
 * to the CLDR source in the meantime.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { realCldr } from '../src/dataset/real.js';
import { CLDR_VERSION, LOCALES } from '../src/dataset/real.js';

const oneXRoot = process.env.CLDR1X_ROOT ?? join(homedir(), 'dev', 'projects', 'cldr-engine');
const fractionsFile = join(oneXRoot, 'packages', 'cldr-core', 'src', 'internals', 'numbers', 'autogen.currencies.ts');
const hasOneX = existsSync(fractionsFile);

/** 1.x compiled currency fractions: 'CODE:digits rounding cashDigits cashRounding|…' */
const parseOneXFractions = (): Map<string, number> => {
  const text = readFileSync(fractionsFile, 'utf8');
  const line = /export const currencyFractionsRaw = '([^']+)'/.exec(text);
  if (line === null) {
    throw new Error(`1.x currencyFractionsRaw not found in ${fractionsFile}`);
  }
  const out = new Map<string, number>();
  for (const entry of line[1].split('|')) {
    const m = /^([A-Z]{3}):(\d+) (\d+) (\d+) (\d+)$/.exec(entry);
    if (m === null) {
      throw new Error(`unparseable 1.x fractions entry '${entry}'`);
    }
    out.set(m[1], Number(m[2]));
  }
  return out;
};

describe.skipIf(!hasOneX)(`1.x parity (Tier 1: fraction digits, ${CLDR_VERSION} vs 1.x CLDR 48.2.0)`, () => {
  const oneX = parseOneXFractions();
  const ours = realCldr().locales[LOCALES[0]].currencies; // digits are locale-independent

  test('every code the 1.x compiler shipped matches the 2.x pipeline digits', () => {
    const mismatches: string[] = [];
    for (const [code, oneXDigits] of oneX) {
      const ourDigits = ours[code]?.fractionDigits;
      if (ourDigits === undefined) {
        mismatches.push(`${code}: 1.x=${oneXDigits}, 2.x=ABSENT from adapter`);
        continue;
      }
      if (ourDigits !== oneXDigits) {
        mismatches.push(`${code}: 1.x=${oneXDigits}, 2.x=${ourDigits}`);
      }
    }
    expect(mismatches, `1.x vs 2.x fraction-digit drift:\n  ${mismatches.join('\n  ')}`).toEqual([]);
  });

  test('the 1.x code set is a subset of the adapter universe (all parity codes resolvable)', () => {
    const missing = [...oneX.keys()].filter((c) => ours[c] === undefined);
    expect(missing).toEqual([]);
  });
});

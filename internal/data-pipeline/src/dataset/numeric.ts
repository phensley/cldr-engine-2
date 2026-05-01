import type { NumericTable } from './types.js';

/**
 * Synthetic numeric table — locale-independent, shared.
 *
 * Exercises: GVE16-only path with a mix of small and near-ceiling
 * values (the 65535 ceiling question lives here, plans/prototype-plan.md
 * §5). Keys are synthetic "zone-offset" groups: ASCII code lookups.
 *
 * Values are offset minutes counted east of UTC-12 — a bias trick that
 * keeps genuinely negative offsets representable in GVE16's unsigned
 * u16 space (a candidate resolution for the signed-offset problem).
 */
export const numeric: NumericTable = {
  keys: [
    'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6', 'UTC-5',
    'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC', 'UTC+1', 'UTC+2', 'UTC+3',
    'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11',
    'UTC+12', 'UTC+13', 'UTC+14', 'EXTREME', 'CEILING',
  ],
  values: [
    0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840,
    900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380, 1440, 1500, 1560,
    65000, 65535,
  ],
};


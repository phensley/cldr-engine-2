/**
 * Calendar feature goldens — real CLDR 48.2.1 gregorian data through the
 * public factory assembly, incl. the zone-offset companion (the deferred
 * unit+offset numeric table).
 */
import { decodeLocalePack, decodeZonesTable } from '@cldr/internal-core';
import { makeCalendarFactory } from '../src/index.js';
import { format, monthName, weekdayName, firstDay, offset } from '@phensley/cldr/calendar/format';
import { en } from '@phensley/cldr/packs/en';
import { enGB } from '@phensley/cldr/packs/enGB';
import { zh } from '@phensley/cldr/packs/zh';
import { ar } from '@phensley/cldr/packs/ar';
import { ru } from '@phensley/cldr/packs/ru';
import { zones } from '@phensley/cldr/packs/zones';

const zonesTable = decodeZonesTable(zones);
const cal = (p: typeof en) => makeCalendarFactory(decodeLocalePack(p), zonesTable, { format, monthName, weekdayName, firstDay, offset });
const at = (f: ReturnType<typeof cal>, iso: string) => f.new(new Date(iso));

describe('calendar (real CLDR 48.2.1, gregorian + offsets)', () => {
  test('en: full/long/medium/short + names', () => {
    const f = cal(en);
    const d = at(f, '2025-03-04T12:00:00Z'); // a Tuesday
    expect(d.format()).toBe('Tuesday, March 4, 2025');
    expect(d.format('long')).toBe('March 4, 2025');
    expect(d.format('medium')).toBe('Mar 4, 2025');
    expect(d.format('short')).toBe('3/4/25');
    expect(d.monthName()).toBe('March');
    expect(d.monthName('abbreviated')).toBe('Mar');
    expect(d.weekdayName()).toBe('Tuesday');
    expect(d.weekdayName('abbreviated')).toBe('Tue');
    expect(d.weekdayName('narrow')).toBe('T');
    expect(d.firstDay()).toBe(1); // en-default region 001 → Monday
  });

  test('en-GB: family delta override — date order (EEEE, d MMMM y)', () => {
    const d = at(cal(enGB), '2025-03-04T12:00:00Z');
    expect(d.format()).toBe('Tuesday, 4 March 2025');
  });

  test('zh: CJK layout (y年M月d日EEEE)', () => {
    const d = at(cal(zh), '2025-03-04T12:00:00Z');
    expect(d.format()).toBe('2025年3月4日星期二');
  });

  test('ar: RTL + Arabic month names', () => {
    const d = at(cal(ar), '2025-03-04T12:00:00Z');
    expect(d.format()).toBe('الثلاثاء، 4 مارس 2025');
  });

  test('ru: quoted literal + genitive month (EEEE, d MMMM y г.)', () => {
    const d = at(cal(ru), '2025-03-04T12:00:00Z');
    expect(d.format()).toBe('вторник, 4 марта 2025\u202fг.');
  });

  test('offset companion: hourFormat + zero + unknown', () => {
    const f = cal(en);
    const d = at(f, '2025-01-15T12:00:00Z');
    expect(d.offset('America/New_York')).toBe('-05:00');
    expect(d.offset('Africa/Abidjan')).toBe('GMT');
    expect(d.offset('Asia/Katmandu')).toBe('+05:45'); // Node tzdb still uses the pre-rename alias
    expect(d.offset('No/Such_Zone')).toBe('GMTNo/Such_Zone');
  });

  test('zones table header: the deferred unit+offset numeric rule', () => {
    expect(zonesTable.unit).toBe(900);
    expect(zonesTable.bias).toBe(50);
    const ny = zonesTable.offsets[zonesTable.keys.indexOf('America/New_York')];
    expect(ny).toBe(-18000);
  });
});

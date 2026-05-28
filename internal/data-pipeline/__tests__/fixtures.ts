import type { CalendarData } from '../src/dataset/types.js';

/**
 * Shared offline test fixture: a nominal gregorian slice satisfying the
 * dataset contract (the REAL adapter carries CLDR data).
 */
export const TEST_CALENDAR: CalendarData = {
  firstDay: 1, minDays: 1, weekendStart: 6, weekendEnd: 0,
  monthsWide: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthsAbbr: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  daysWide: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  daysAbbr: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  daysNarrow: ['S','M','T','W','T','F','S'],
  erasWide: ['Before Christ','Anno Domini'], erasAbbr: ['BC','AD'],
  dayPeriodsAm: 'AM', dayPeriodsPm: 'PM',
  dateFormats: { full: 'EEEE, MMMM d, y', long: 'MMMM d, y', medium: 'MMM d, y', short: 'M/d/yy' },
  timeFormats: { full: 'h:mm:ss a zzzz', long: 'h:mm:ss a z', medium: 'h:mm:ss a', short: 'h:mm a' },
  hourFormat: '+HH:mm;-HH:mm',
  gmtFormat: 'GMT{0}',
};

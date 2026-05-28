/**
 * Calendar pattern renderer (shared by the calendar slot modules) —
 * the ICU date-pattern SUBSET the proof needs, over proleptic Gregorian:
 *
 *   y       year (1+ digits)
 *   M / MM  numeric month (no pad / zero-pad)
 *   MMM / MMMM  abbreviated / wide month name
 *   d / dd  day of month
 *   E / EEEE  abbreviated / wide weekday
 *   h / hh  12-hour, m / mm minutes, s seconds, a am/pm
 *   '…'     quoted literal ('' = apostrophe; ru's 'г'.)
 *   other chars pass through as literals
 *
 * Dates are interpreted as UTC (construct via new Date('<ISO>Z')).
 */
import type { CalendarState } from '../api.js';

export type DateStyle = 'full' | 'long' | 'medium' | 'short';

const pad2 = (n: number): string => String(n).padStart(2, '0');

const runLength = (pattern: string, i: number, c: string): number => {
  let j = i;
  while (j < pattern.length && pattern[j] === c) {
    j++;
  }
  return j - i;
};

/** Day-of-month names per locale style. */
const monthNameOf = (cal: CalendarState['pack']['calendar'], m: number, style: 'wide' | 'abbreviated') =>
  (style === 'wide' ? cal.names.monthsWide : cal.names.monthsAbbr)[m - 1];

/** Weekday names per locale style. */
const weekdayNameOf = (cal: CalendarState['pack']['calendar'], wd: number, style: 'wide' | 'abbreviated' | 'narrow') =>
  (style === 'wide' ? cal.names.daysWide : style === 'abbreviated' ? cal.names.daysAbbr : cal.names.daysNarrow)[wd];

export const format = (state: CalendarState, style: DateStyle = 'full'): string => {
  const cal = state.pack.calendar;
  const pattern = cal.dateFormats[style === 'full' ? 0 : style === 'long' ? 1 : style === 'medium' ? 2 : 3];
  const d = state.date;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const wd = d.getUTCDay();
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? cal.names.am : cal.names.pm;

  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "'") {
      let j = i + 1;
      let lit = '';
      while (j < pattern.length && pattern[j] !== "'") {
        lit += pattern[j];
        j++;
      }
      out += lit.replace(/''/g, "'");
      i = j + 1;
      continue;
    }
    if (c === 'y') {
      const run = runLength(pattern, i, 'y');
      out += run >= 2 ? pad2(y % 100) : String(y);
      i += run;
      continue;
    }
    if (c === 'M') {
      const run = runLength(pattern, i, 'M');
      out += run >= 4 ? monthNameOf(cal, m, 'wide') : run === 3 ? monthNameOf(cal, m, 'abbreviated') : run === 2 ? pad2(m) : String(m);
      i += run;
      continue;
    }
    if (c === 'd') {
      const run = runLength(pattern, i, 'd');
      out += run >= 2 ? pad2(day) : String(day);
      i += run;
      continue;
    }
    if (c === 'E') {
      const run = runLength(pattern, i, 'E');
      out += run >= 4 ? weekdayNameOf(cal, wd, 'wide') : weekdayNameOf(cal, wd, 'abbreviated');
      i += run;
      continue;
    }
    if (c === 'h' || c === 'm' || c === 's') {
      const run = runLength(pattern, i, c);
      const v = c === 'h' ? h12 : c === 'm' ? d.getUTCMinutes() : d.getUTCSeconds();
      out += run >= 2 ? pad2(v) : String(v);
      i += run;
      continue;
    }
    if (c === 'a') {
      out += ampm;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
};

export const monthName = (state: CalendarState, style: 'wide' | 'abbreviated' = 'wide'): string =>
  monthNameOf(state.pack.calendar, state.date.getUTCMonth() + 1, style);

export const weekdayName = (state: CalendarState, style: 'wide' | 'abbreviated' | 'narrow' = 'wide'): string =>
  weekdayNameOf(state.pack.calendar, state.date.getUTCDay(), style);

export const firstDay = (state: CalendarState): number => state.pack.calendar.firstDay;

/**
 * A zone's UTC offset at the state's instant, rendered per the locale's
 * hourFormat ('+HH:mm;-HH:mm'): positive/negative subpatterns, gmtFormat
 * fallback for sub-minute offsets and unknown zones.
 */
export const offset = (state: CalendarState, zone: string): string => {
  const idx = state.zones.keys.indexOf(zone);
  const secs = idx < 0 ? NaN : state.zones.offsets[idx];
  const gmt = (body: string) => state.pack.calendar.gmtFormat.replace('{0}', body);
  if (Number.isNaN(secs)) {
    return gmt(zone); // unknown zone — format the id in GMT terms
  }
  if (secs === 0) {
    return 'GMT';
  }
  const sign = secs < 0 ? '-' : '+';
  const abs = Math.abs(secs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (s !== 0) {
    return gmt(`${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`);
  }
  const [pos, neg] = state.pack.calendar.hourFormat.split(';');
  return (secs < 0 ? neg : pos).replace('HH', pad2(h)).replace('mm', pad2(m));
};

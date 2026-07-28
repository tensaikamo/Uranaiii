/**
 * Time normalisation (spec §2).
 *
 * The rule that governs this whole file: solar-term ingress is an astronomical
 * event and happens at the same instant everywhere on Earth, so the year and
 * month pillars are judged in UT. The day boundary and the hour branch are
 * properties of the local sky, so they are judged in local apparent time.
 * These are two different clocks and are kept as two separate values. Folding
 * them into one is the single most common way to get this wrong.
 */

import { equationOfTime, julianDay } from './swe.js';

export const JAPAN_STANDARD_MERIDIAN = 135;

/**
 * Japanese daylight saving time, 1948-1951 (spec §2.4).
 *
 * Half-open UT intervals [start, end) during which Japan observed UTC+10.
 * Taken from the IANA time zone database (Asia/Tokyo) rather than from the
 * statute text; tools/verify.mjs re-derives them from the host's own tz data
 * and fails if this table drifts.
 */
const DST_INTERVALS_UTC = [
  { start: [1948, 5, 1, 15], end: [1948, 9, 11, 15] },
  { start: [1949, 4, 2, 15], end: [1949, 9, 10, 15] },
  { start: [1950, 5, 6, 15], end: [1950, 9, 9, 15] },
  { start: [1951, 5, 5, 15], end: [1951, 9, 8, 15] },
];

let dstCache = null;

function dstIntervals() {
  if (!dstCache) {
    dstCache = DST_INTERVALS_UTC.map(({ start, end }) => ({
      start: julianDay(start[0], start[1], start[2], start[3]),
      end: julianDay(end[0], end[1], end[2], end[3]),
    }));
  }
  return dstCache;
}

/**
 * Standard-time offset in hours for a wall-clock reading in Japan.
 *
 * The wall clock is what the user copied off a birth record, so the lookup has
 * to be done in wall-clock terms: during the 1948-1951 summers the clock read
 * UTC+10. Returns the offset and whether the reading falls in the hour that
 * the autumn fall-back repeats, which cannot be resolved from the clock alone.
 */
export function japanOffsetHours(wallJd) {
  for (const { start, end } of dstIntervals()) {
    const wallStart = start + 10 / 24; // clock jumps 24:00 -> 01:00 JDT
    const wallEnd = end + 10 / 24; // clock falls 01:00 JDT -> 00:00 JST
    if (wallJd >= wallStart && wallJd < wallEnd) {
      return { offsetHours: 10, daylightSaving: true, ambiguous: false };
    }
    // The hour immediately after the fall-back is lived through twice.
    if (wallJd >= wallEnd - 1 / 24 && wallJd < wallEnd) {
      return { offsetHours: 10, daylightSaving: true, ambiguous: true };
    }
    if (wallJd >= wallEnd && wallJd < wallEnd + 1 / 24) {
      return { offsetHours: 9, daylightSaving: false, ambiguous: true };
    }
  }
  return { offsetHours: 9, daylightSaving: false, ambiguous: false };
}

/** Local mean time offset from UT, in days, for a given longitude. */
export function localMeanOffsetDays(longitudeDeg) {
  return longitudeDeg / 360;
}

/**
 * Minutes by which local mean time leads Japan Standard Time.
 * This is the "27 minutes" of spec §5.4 for Iwamizawa.
 */
export function localMeridianOffsetMinutes(longitudeDeg) {
  return (longitudeDeg - JAPAN_STANDARD_MERIDIAN) * 4;
}

/**
 * Build both time bases from a wall-clock birth record.
 *
 * `solarTime` selects how the local clock is derived, and is one of the three
 * states of the correction axis in spec §4.1:
 *   'apparent' - local mean time plus the equation of time (the real sky)
 *   'mean'     - local mean time only (longitude, but no equation of time)
 *   'standard' - the JST clock as written, with no local correction at all
 *
 * Whichever is chosen, `ut` is unaffected: the term boundaries never move.
 */
export function normaliseTime({ year, month, day, hour, minute, longitude, solarTime = 'apparent' }) {
  const wallJd = julianDay(year, month, day, hour + minute / 60);
  const { offsetHours, daylightSaving, ambiguous } = japanOffsetHours(wallJd);

  const ut = wallJd - offsetHours / 24;
  const equationDays = equationOfTime(ut);
  const meanOffset = localMeanOffsetDays(longitude);

  let local;
  if (solarTime === 'apparent') local = ut + meanOffset + equationDays;
  else if (solarTime === 'mean') local = ut + meanOffset;
  else local = ut + JAPAN_STANDARD_MERIDIAN / 360; // standard meridian clock

  return {
    ut,
    local,
    wallJd,
    offsetHours,
    daylightSaving,
    ambiguous,
    equationMinutes: equationDays * 1440,
    meridianMinutes: localMeridianOffsetMinutes(longitude),
    totalShiftMinutes: (local - (ut + JAPAN_STANDARD_MERIDIAN / 360)) * 1440,
  };
}

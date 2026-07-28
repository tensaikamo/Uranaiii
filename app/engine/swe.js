/**
 * Swiss Ephemeris binding.
 *
 * Every function here is UT-based (spec §2.3). The ET-based entry points
 * (swe_calc, swe_solcross) are deliberately not re-exported, so a caller
 * cannot accidentally mix time scales. tools/verify.mjs greps app/ to prove
 * the ET forms never appear.
 */

import SwissEph from '../../vendor/swisseph-wasm/src/swisseph.js';

export const SE_SUN = 0;
export const SEFLG_SWIEPH = 2;
export const GREGORIAN = 1;

let swe = null;

export async function initEphemeris() {
  if (swe) return;
  const instance = new SwissEph();
  await instance.initSwissEph();
  swe = instance;
}

export function isReady() {
  return swe !== null;
}

function need() {
  if (!swe) throw new Error('ephemeris not initialised');
  return swe;
}

/** Apparent geocentric ecliptic longitude of the Sun, degrees [0,360). */
export function sunLongitude(jdUt) {
  return need().calc_ut(jdUt, SE_SUN, SEFLG_SWIEPH)[0];
}

/**
 * Equation of time at jdUt, in days.
 *
 * Sign convention verified empirically against the analemma (see VERIFY.md):
 * swe_time_equ returns apparent minus mean solar time, so it is negative in
 * mid-February (about -14 min) and positive in early November (about +16 min)
 * and is therefore added, not subtracted, when building local apparent time.
 */
export function equationOfTime(jdUt) {
  return need().time_equ(jdUt);
}

/** First moment after startJdUt at which the Sun's longitude equals lonDeg. */
export function sunCrossing(lonDeg, startJdUt) {
  return need().solcross_ut(lonDeg, startJdUt, SEFLG_SWIEPH);
}

export function julianDay(year, month, day, hourFraction) {
  return need().julday(year, month, day, hourFraction);
}

export function calendarDate(jd) {
  return need().revjul(jd, GREGORIAN);
}

export function deltaTSeconds(jd) {
  return need().deltat(jd) * 86400;
}

export function ephemerisVersion() {
  return need().version();
}

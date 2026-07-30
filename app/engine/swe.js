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
export const SE_MOON = 1;
export const SEFLG_SWIEPH = 2;
export const SEFLG_SIDEREAL = 65536;
export const GREGORIAN = 1;

/**
 * Lahiri, the ayanāṃśa the sidereal systems here are measured against.
 *
 * 宿曜 divides the sidereal zodiac, so it needs a zero point, and the zero point
 * is a choice — Lahiri, Fagan/Bradley and Raman disagree by about a degree,
 * which is a fourteenth of a 宿. Lahiri is the Indian government standard and
 * the one the 27-mansion tradition is normally computed against, so it is what
 * this file uses; naming it here means the choice is visible rather than
 * buried in a flag.
 */
export const SE_SIDM_LAHIRI = 1;

/**
 * Calendar years the bundled ephemeris files actually cover.
 *
 * `sepl_18.se1` and its companions span 1800-2399. Outside that, Swiss
 * Ephemeris does not fail — it quietly falls back to the built-in Moshier
 * theory and returns a slightly different answer with no visible sign. That is
 * a silent change of method, so the range is enforced at the input instead of
 * letting the fallback happen unannounced.
 */
export const EPHEMERIS_YEARS = { from: 1800, to: 2399 };

export function withinEphemeris(year) {
  return year >= EPHEMERIS_YEARS.from && year <= EPHEMERIS_YEARS.to;
}

let swe = null;

export async function initEphemeris() {
  if (swe) return;
  const instance = new SwissEph();
  await instance.initSwissEph();
  // The sidereal zero point is global state inside the library, so it is set
  // once here rather than by whoever happens to ask first. Setting it per call
  // would mean the answer depended on call order, which is the kind of bug that
  // only shows up on one page.
  instance.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);
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

/** Apparent geocentric ecliptic longitude of the Moon, degrees [0,360). */
export function moonLongitude(jdUt) {
  return need().calc_ut(jdUt, SE_MOON, SEFLG_SWIEPH)[0];
}

/**
 * Sidereal ecliptic longitude of the Moon (Lahiri), degrees [0,360).
 *
 * This is the library's own sidereal position, not tropical-minus-ayanāṃśa.
 * The two differ by about 13″ because Swiss Ephemeris projects onto the
 * ecliptic of the reference epoch rather than of date. 13″ is a four-hundredth
 * of a 宿 and changes no answer, but the *boundary* search has to run on the
 * same definition as the classifier or the two disagree by half a minute for
 * no reason anybody could explain. So there is one definition, here.
 */
export function moonLongitudeSidereal(jdUt) {
  return need().calc_ut(jdUt, SE_MOON, SEFLG_SWIEPH | SEFLG_SIDEREAL)[0];
}

/** The ayanāṃśa (Lahiri) at jdUt, in degrees. About 23.7° around 1990. */
export function ayanamsa(jdUt) {
  return need().get_ayanamsa_ut(jdUt);
}

/**
 * First moment after startJdUt at which the Moon's tropical longitude equals
 * lonDeg. Used only to check the boundary search from the other side — see
 * tools/verify.mjs.
 */
export function moonCrossing(lonDeg, startJdUt) {
  return need().mooncross_ut(lonDeg, startJdUt, SEFLG_SWIEPH);
}

/**
 * House cusps and the angles, for a birth at (latDeg, lonDeg).
 *
 * Returns `{ cusps, ascmc }`; `ascmc[0]` is the ascendant, `[1]` the midheaven,
 * `[2]` the ARMC. **Latitude comes first** — swapping the two arguments yields a
 * perfectly plausible wrong ascendant with no error, so verify.mjs recomputes
 * the ascendant from the ARMC by an independent formula that uses the latitude
 * explicitly.
 */
export function houseCusps(jdUt, latDeg, lonDeg, system = 'P') {
  return need().houses(jdUt, latDeg, lonDeg, system);
}

/** True obliquity of the ecliptic at jdUt, in degrees. */
export function obliquity(jdUt) {
  // -1 is SE_ECL_NUT: the pseudo-body whose "longitude" is the true obliquity.
  return need().calc_ut(jdUt, -1, SEFLG_SWIEPH)[0];
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

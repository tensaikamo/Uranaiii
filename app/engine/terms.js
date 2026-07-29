/**
 * Solar terms (spec §3.1, §3.2).
 *
 * The month pillar turns on the twelve 節, not on the 中気 and not on the
 * civil month. Their ecliptic longitudes run 315, 345, 15, 45 ... which wraps
 * through 0. Comparing those numbers directly makes 清明 (15) look like the
 * smallest of the year and destroys the ordering, so every comparison in this
 * file is done on a value measured *from 立春*, via mod 360. Nothing here ever
 * compares raw longitudes.
 */

import { sunLongitude, sunCrossing } from './swe.js';

/** The twelve 節, in the order they occur within a solar year from 立春. */
export const SETSU = [
  { name: '立春', longitude: 315, branch: 2 },
  { name: '啓蟄', longitude: 345, branch: 3 },
  { name: '清明', longitude: 15, branch: 4 },
  { name: '立夏', longitude: 45, branch: 5 },
  { name: '芒種', longitude: 75, branch: 6 },
  { name: '小暑', longitude: 105, branch: 7 },
  { name: '立秋', longitude: 135, branch: 8 },
  { name: '白露', longitude: 165, branch: 9 },
  { name: '寒露', longitude: 195, branch: 10 },
  { name: '立冬', longitude: 225, branch: 11 },
  { name: '大雪', longitude: 255, branch: 0 },
  { name: '小寒', longitude: 285, branch: 1 },
];

const RISSHUN_LONGITUDE = 315;
const SOLSTICE_LONGITUDE = 270;

/** Degrees travelled since 立春: the unwrapped coordinate all ordering uses. */
export function degreesSinceRisshun(longitudeDeg) {
  return ((longitudeDeg - RISSHUN_LONGITUDE) % 360 + 360) % 360;
}

/**
 * The 節 period containing jdUt, by true solar longitude (定気法).
 *
 * Both boundaries are found with swe_solcross_ut, which brackets and converges
 * on the crossing internally, so no hand-rolled bisection is needed. The
 * searches are anchored relative to jdUt rather than to a calendar year: the
 * Sun passes any given longitude once a year, so starting 40 days back is
 * guaranteed to return the crossing that opened the current period.
 */
export function trueTermPeriod(jdUt) {
  const longitude = sunLongitude(jdUt);
  const index = Math.floor(degreesSinceRisshun(longitude) / 30);
  const term = SETSU[index];
  const next = SETSU[(index + 1) % 12];

  return {
    method: 'teiki',
    longitude,
    term,
    next,
    branch: term.branch,
    start: sunCrossing(term.longitude, jdUt - 40),
    end: sunCrossing(next.longitude, jdUt),
  };
}

/**
 * The most recent crossing of `lonDeg` at or before jdUt.
 *
 * swe_solcross_ut returns the *next* crossing after the point it is given, so
 * this walks forward from a point comfortably in the past and stops at the
 * last crossing that has already happened. Taking the first crossing after
 * jdUt-366 is not enough: the tropical year is 365.24 days, so a 366-day
 * window can contain two crossings, and for a birth shortly after an ingress
 * the earlier one is returned — which silently leaves the year pillar a year
 * behind while the month pillar moves on.
 */
function lastCrossingAtOrBefore(lonDeg, jdUt) {
  let candidate = sunCrossing(lonDeg, jdUt - 400);
  // Each step advances by about a tropical year, so two are always enough; the
  // bound exists so a malformed return from the ephemeris cannot spin forever.
  for (let guard = 0; guard < 4; guard += 1) {
    const next = sunCrossing(lonDeg, candidate + 10);
    if (!Number.isFinite(next) || next <= candidate || next > jdUt) return candidate;
    candidate = next;
  }
  return candidate;
}

/** The 冬至 at or before jdUt, plus the following one. */
function solsticeCycle(jdUt) {
  const previous = lastCrossingAtOrBefore(SOLSTICE_LONGITUDE, jdUt);
  const next = sunCrossing(SOLSTICE_LONGITUDE, previous + 10);
  return { previous, next, step: (next - previous) / 24 };
}

/**
 * The 節 period containing jdUt under 恒気法.
 *
 * The year is divided into 24 equal intervals from 冬至, so the 節 fall on the
 * odd steps: 小寒 at 1, 立春 at 3, and so on to 大雪 at 23. The interval length
 * is measured between two observed solstices rather than assumed from a
 * constant, which keeps the division consistent with the ephemeris.
 */
export function meanTermPeriod(jdUt) {
  const { previous, step } = solsticeCycle(jdUt);
  const elapsed = Math.floor((jdUt - previous) / step);
  const startStep = elapsed % 2 === 0 ? elapsed - 1 : elapsed;

  // startStep === -1 is the 大雪 period that opened before this 冬至.
  const branch = (((startStep - 1) / 2 + 1) % 12 + 12) % 12;
  const termIndex = (branch + 10) % 12; // branch 2 (寅) is SETSU[0]

  return {
    method: 'kouki',
    longitude: sunLongitude(jdUt),
    term: SETSU[termIndex],
    next: SETSU[(termIndex + 1) % 12],
    branch,
    start: previous + startStep * step,
    end: previous + (startStep + 2) * step,
  };
}

export function termPeriod(jdUt, method) {
  return method === 'kouki' ? meanTermPeriod(jdUt) : trueTermPeriod(jdUt);
}

/**
 * All twelve 節 of the solar year containing jdUt, with their ingress instants.
 *
 * Presentation only — the pillars never consult this. Each ingress is found by
 * searching forward from the previous one, which keeps every search anchored
 * to a point at most ~31 days away and so cannot return the wrong year's
 * crossing.
 */
export function termIngresses(jdUt, method = 'teiki') {
  const risshun = governingRisshun(jdUt, method);

  if (method === 'kouki') {
    const { previous, step } = solsticeCycle(risshun + 1);
    return SETSU.map((term, k) => ({ term, start: previous + (3 + 2 * k) * step }));
  }

  const out = [{ term: SETSU[0], start: risshun }];
  let cursor = risshun;
  for (let k = 1; k < 12; k += 1) {
    cursor = sunCrossing(SETSU[k].longitude, cursor + 1);
    out.push({ term: SETSU[k], start: cursor });
  }
  return out;
}

/**
 * The 立春 governing jdUt, i.e. the most recent one at or before it.
 *
 * The sexagenary year turns at 立春, never on 1 January, and 立春 itself drifts
 * by several hours from year to year, so it is always computed, never assumed
 * from a date.
 */
export function governingRisshun(jdUt, method = 'teiki') {
  if (method !== 'kouki') {
    return lastCrossingAtOrBefore(RISSHUN_LONGITUDE, jdUt);
  }
  const { previous, step } = solsticeCycle(jdUt);
  const candidate = previous + 3 * step;
  if (candidate <= jdUt) return candidate;
  const earlier = solsticeCycle(previous - 10);
  return earlier.previous + 3 * earlier.step;
}

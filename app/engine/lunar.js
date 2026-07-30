/**
 * The lunar substrate: 朔, 月齢, and the sidereal position everything else
 * that involves the Moon is measured from.
 *
 * (Named `lunar.js` rather than `sky.js` because `app/ui/sky.js` already exists
 * and draws the starfield. Two files with one name and no relationship is a
 * trap for whoever reads this next.)
 *
 * Nothing here is divination. It is the same kind of layer as `terms.js`: the
 * astronomy the divination sits on, computed rather than looked up, so that a
 * boundary case can be *shown* instead of guessed at.
 *
 * ## Why any of this needs care
 *
 * The Moon moves about 13° a day — fourteen times the Sun's rate. Almost every
 * Moon-based system therefore has boundaries that a person can genuinely fall
 * on: a birth time uncertain by half an hour is uncertain by about 0.3° of
 * lunar longitude, which is a fortieth of a 宿 — small, but a birth recorded
 * only to the day is uncertain by 13°, which is a whole 宿. Apps that work from
 * a table of dates cannot say this. This one can, so it does.
 *
 * Every search here is a bisection on a function that is *known to be monotone*
 * over the bracket, and each one says why it is monotone. The alternative —
 * trusting a crossing function to have been given a good enough anchor — is the
 * exact trap `terms.js` documents having fallen into with the solar terms.
 */

import { moonLongitude, moonLongitudeSidereal, sunLongitude } from './swe.js';

/** Mean synodic month, days. Used only to *estimate* where to start looking. */
const SYNODIC = 29.530588;

/** Degrees of elongation gained per day, on average. 360 / SYNODIC. */
const ELONGATION_RATE = 360 / SYNODIC;

/** The 27 mansions divide the sidereal circle evenly. */
export const MANSION_SPAN = 360 / 27;

/** Signed difference in degrees, in (-180, 180]. */
function wrap180(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/** Elongation of the Moon from the Sun, in (-180, 180]. Zero at 朔. */
export function elongation(jdUt) {
  return wrap180(moonLongitude(jdUt) - sunLongitude(jdUt));
}

/**
 * Bisect `f` for its root in [lo, hi], given f(lo) < 0 <= f(hi).
 *
 * 60 halvings take a 3-day bracket below a microsecond, far past the accuracy
 * of anything it is applied to; the loop is fixed-length so it cannot spin.
 *
 * **Returns the high end, not the midpoint,** and that choice is load-bearing.
 * The midpoint's sign is whatever it happens to be, so a search run *on its own
 * previous answer* could see a value a nanosecond before the root, read that as
 * "not yet", and hand back the previous lunation — a whole month out. Returning
 * `b` guarantees `f(result) >= 0`, which makes the search idempotent: feeding a
 * 朔 back in returns that same 朔. It cost 200 wrong synodic months in the gate
 * to notice, and it would have shown up in the app as 月齢 29.5 for someone born
 * at the instant of the new moon.
 */
function bisect(f, lo, hi, steps = 60) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < steps; i += 1) {
    const mid = (a + b) / 2;
    if (f(mid) < 0) a = mid; else b = mid;
  }
  return b;
}

/**
 * The 朔 (new moon) that opened the lunation containing jdUt.
 *
 * Elongation rises monotonically: the Moon's own rate varies between about
 * 11.8°/day and 15.4°/day, the Sun's between 0.95 and 1.02, so the difference
 * never drops below roughly 10.8°/day and never reverses. That is what makes a
 * plain bisection safe — and it is a fact about the two bodies, not an
 * assumption about the ephemeris.
 *
 * The first estimate comes from the mean rate; the bracket is then widened
 * until it actually straddles the root, because the mean rate can be off by
 * most of a day near perigee and a bracket that does not straddle would have
 * the bisection converge confidently on the wrong end.
 */
export function newMoonAtOrBefore(jdUt) {
  // How far into the lunation we already are, as an angle in [0, 360).
  const travelled = ((elongation(jdUt) % 360) + 360) % 360;
  let estimate = jdUt - travelled / ELONGATION_RATE;

  // Straddle it. Half a day either side covers the mean-rate error in the
  // ordinary case; the loop exists for the extremes.
  let lo = estimate - 0.6;
  let hi = estimate + 0.6;
  for (let guard = 0; guard < 8 && !(elongation(lo) < 0 && elongation(hi) >= 0); guard += 1) {
    lo -= 0.5;
    hi += 0.5;
  }
  if (!(elongation(lo) < 0 && elongation(hi) >= 0)) return null;
  return bisect(elongation, lo, hi);
}

/** The next 朔 strictly after jdUt. */
export function newMoonAfter(jdUt) {
  const opened = newMoonAtOrBefore(jdUt);
  if (opened === null) return null;
  return newMoonAtOrBefore(opened + SYNODIC + 2);
}

/** 月齢 — days elapsed since the 朔 that opened this lunation, 0 to ~29.5. */
export function moonAge(jdUt) {
  const opened = newMoonAtOrBefore(jdUt);
  return opened === null ? null : jdUt - opened;
}

/**
 * The eight phases, by elongation rather than by 月齢.
 *
 * 月齢 is the number people know, so it is reported alongside — but the *phase*
 * is what the eye sees, and what the eye sees is the elongation. The two
 * disagree by up to half a day near perigee, and keying the name to the angle
 * means the name never contradicts the shape.
 *
 * The traditional names (十六夜, 寝待月 …) are day-counts, not shapes, so they
 * are not used as bucket labels; that would be borrowing their authority for a
 * different measurement.
 */
const PHASES = [
  { name: '新月', plain: '月が見えないころ' },
  { name: '三日月', plain: '細く満ちはじめたころ' },
  { name: '上弦', plain: '半分まで満ちたころ' },
  { name: '満ちかけ', plain: '満月の手前' },
  { name: '満月', plain: '満ちきったころ' },
  { name: '欠けはじめ', plain: '満月を過ぎたころ' },
  { name: '下弦', plain: '半分まで欠けたころ' },
  { name: '有明', plain: '細く残るころ' },
];

/** Phase at jdUt: the name, the elongation it came from, and 月齢. */
export function moonPhase(jdUt) {
  const angle = ((elongation(jdUt) % 360) + 360) % 360;
  // Buckets are centred on the eight phases, so 満月 means "near 180°", not
  // "past 180°" — an offset of half a bucket before flooring.
  const index = Math.floor(((angle + 22.5) % 360) / 45);
  return {
    ...PHASES[index],
    index,
    elongation: angle,
    age: moonAge(jdUt),
  };
}

/** Sidereal longitude of the Moon, degrees [0,360). One definition, from swe.js. */
export function moonSidereal(jdUt) {
  return ((moonLongitudeSidereal(jdUt) % 360) + 360) % 360;
}

/** Which of the 27 equal sidereal divisions the Moon is in at jdUt. */
export function mansionIndex(jdUt) {
  return Math.floor(moonSidereal(jdUt) / MANSION_SPAN);
}

/**
 * When the Moon enters, and leaves, the division it occupies at jdUt.
 *
 * The classifier and this search run on the same `moonSidereal`, so a chart can
 * never be told it is in one division while the boundary times say another. The
 * search is bracketed at ±1.2 days: a division is 13.33° wide and the Moon
 * covers at least 11.76°/day, so it cannot be inside one for longer than that.
 *
 * The target is approached through `wrap180`, so a division that straddles 0°
 * needs no special case.
 */
export function mansionWindow(jdUt) {
  const index = mansionIndex(jdUt);
  const enters = index * MANSION_SPAN;
  const leaves = ((index + 1) * MANSION_SPAN) % 360;
  const offsetFrom = (target) => (j) => wrap180(moonSidereal(j) - target);

  const start = bisect(offsetFrom(enters), jdUt - 1.2, jdUt);
  const end = bisect(offsetFrom(leaves), jdUt, jdUt + 1.2);
  return { index, start, end };
}

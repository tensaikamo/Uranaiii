/**
 * 大運 — the ten-year cycles, and the first thing in this app that can say
 * *when*.
 *
 * Everything up to here describes a fixed chart: this is who you are, this is
 * what you need. 大運 is what turns that into a timeline — which decade of a
 * life the needed element actually arrives in, and which decade runs against
 * it. It is the reason four pillars gets used for decisions at all.
 *
 * The method, and where the schools sit:
 *
 *   direction  陽男陰女 run 順行 (forward through the sexagenary cycle from the
 *              month pillar); 陰男陽女 run 逆行. This is why the calculation
 *              needs a sex — it is a parameter of the rule, nothing more, and
 *              the app asks for it in those terms and lets it be declined.
 *
 *   立運        the age the first cycle starts. Count the days from the birth
 *              to the *next* 節入り when running forward, or back to the
 *              *previous* one when running in reverse, then divide by three:
 *              three days stand for one year, so one leftover day is four
 *              months. Schools differ on how the remainder is rounded; this one
 *              keeps the months rather than discarding them, and shows the day
 *              count it started from so the rounding can be checked.
 *
 * The ingress instants come from the same engine the month pillar uses, so the
 * 27 minutes of §2 are already in them.
 */

import { pillarFromIndex } from './pillars.js';
import { japanNow } from './time.js';

/** Yang stems are the even indices: 甲丙戊庚壬. */
const isYangStem = (stemIndex) => stemIndex % 2 === 0;

/**
 * 順行 or 逆行.
 * 陽男 and 陰女 go forward; 陰男 and 陽女 go back.
 */
export function luckDirection(yearStemIndex, sex) {
  const yang = isYangStem(yearStemIndex);
  const male = sex === 'male';
  return (yang === male) ? 'forward' : 'reverse';
}

/**
 * 立運 — how old the first cycle starts.
 * Returns the raw day count too, because that is the number the rounding
 * argument is actually about.
 */
export function luckOnset(chart, direction) {
  const period = chart.pillars.period;
  const days = direction === 'forward'
    ? period.end - chart.time.ut
    : chart.time.ut - period.start;

  const years = Math.floor(days / 3);
  const remainderDays = days - years * 3;
  // Three days stand for a year, so one day is four months.
  const months = Math.round(remainderDays * 4);
  // 12 months would read as "4年12ヶ月"; carry it.
  const carried = months >= 12 ? { years: years + 1, months: 0 } : { years, months };

  return {
    days,
    years: carried.years,
    months: carried.months,
    fromTerm: direction === 'forward' ? period.next.name : period.term.name,
  };
}

/**
 * The cycles themselves, walking the sexagenary order from the month pillar.
 *
 * `fit` answers the question the reader actually has: is this decade carrying
 * what the chart needs, or what drains it?
 */
export function luckPeriods(chart, strength, sex, count = 9) {
  if (sex !== 'male' && sex !== 'female') return null;

  const direction = luckDirection(chart.pillars.year.stem, sex);
  const onset = luckOnset(chart, direction);

  // The month pillar's own index in the 60-cycle; the first 大運 is the one
  // immediately after it (or before it, running in reverse).
  const month = chart.pillars.month;
  let index = 0;
  for (let n = 0; n < 60; n += 1) {
    if (n % 10 === month.stem && n % 12 === month.branch) { index = n; break; }
  }

  const step = direction === 'forward' ? 1 : -1;
  const periods = [];
  for (let i = 1; i <= count; i += 1) {
    const pillar = pillarFromIndex(index + step * i);
    const from = onset.years + (i - 1) * 10;
    const fit = strength.needed.includes(pillar.stemElement) ? 'needed'
      : strength.avoided.includes(pillar.stemElement) ? 'avoided' : 'neutral';
    periods.push({
      index: i,
      pillar,
      fromAge: from,
      toAge: from + 10,
      // The months only shift the very first boundary; after that the cycles
      // are exactly ten years apart.
      fromMonths: i === 1 ? onset.months : 0,
      fit,
    });
  }

  return { direction, onset, periods };
}

/**
 * Which cycle an age falls in.
 *
 * The comparison is against `fromAge + fromMonths/12`, not `fromAge`. 立運 is
 * "7歳6ヶ月", and rounding that down to 7 puts a seven-year-old inside a cycle
 * that has not started yet — wrong by up to a year at the one boundary a reader
 * is most likely to be sitting on.
 *
 * Ages before the first cycle belong to none of them. Saying so is more honest
 * than stretching the first cycle backwards to cover the gap.
 */
export function cycleAtAge(luck, exactAge) {
  // `timeline(input, strength, luck, now)` takes luck third; passing the wrong
  // object there used to throw here instead of degrading, which turns an
  // argument-order slip into a blank page.
  if (!luck || !Array.isArray(luck.periods)) return null;
  return luck.periods.find((p) => {
    const from = p.fromAge + (p.fromMonths || 0) / 12;
    return exactAge >= from && exactAge < from + 10;
  }) || null;
}

/** Age today in whole years, reckoned in Japan. */
export function ageNow(input, now = new Date()) {
  return Math.floor(ageExact(input, now));
}

/**
 * Age as a fraction of a year, reckoned in Japan.
 * Both dates are taken in Japanese civil terms; mixing a JST birth date with a
 * UTC "today" moves every birthday by a day.
 */
export function ageExact(input, now = new Date()) {
  const today = japanNow(now);
  const days = Date.UTC(today.year, today.month - 1, today.day)
    - Date.UTC(input.year, input.month - 1, input.day);
  return days / 86400000 / 365.2425;
}

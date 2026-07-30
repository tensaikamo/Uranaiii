/**
 * 西洋占星術の三点 — 太陽星座, 月星座, アセンダント. Plus 月相.
 *
 * Three points, not a full chart. The three are chosen because they are the
 * three that a birth record can actually support, and because each one needs a
 * different amount of the record — which turns out to be the most useful thing
 * this file has to say.
 *
 * ## What each point costs
 *
 *   太陽星座    the date. Everyone has one; it is why this is the one people know.
 *   月星座      the date, and roughly the time. The Moon crosses a sign in about
 *               2.3 days, so a record with no time straddles a boundary about
 *               two times in five.
 *   アセンダント the exact time **and the latitude**. It goes round the whole
 *               circle in a day.
 *
 * The ascendant moves between about 5.8° and 13.7° per half hour at Japanese
 * latitudes (measured, not assumed — the rate depends on latitude and on which
 * part of the ecliptic is rising). A sign is 30°. So a birth time good to ±30
 * minutes leaves the ascendant genuinely uncertain a fair fraction of the time,
 * and a birth time that was **not recorded at all leaves it completely
 * undetermined** — every one of the twelve signs rises during a day.
 *
 * **So with no birth time this file returns no ascendant.** Not a default, not
 * a noon value, not a "probably". Filling that gap with a plausible number is
 * the single most common thing astrology software does that it cannot justify,
 * and it is invisible to the reader because the output looks identical either
 * way.
 *
 * ## Why the latitude is asked for again
 *
 * It was removed earlier, correctly, as an input nothing used. It is back
 * because the ascendant genuinely needs it, and the form says so at the field
 * rather than collecting it on spec. The 命式 still does not use it: 真太陽時
 * depends on longitude alone. Swapping the two arguments produces a perfectly
 * plausible ascendant two signs away with no error of any kind, so the gate
 * recomputes it from the ARMC by a formula that uses the latitude explicitly.
 *
 * ## Why there is no house-system choice
 *
 * Placidus and Whole Sign are a real disagreement — about the *cusps*. They
 * give the identical ascendant, and the cusps are not used here. Offering the
 * choice would be offering a control that changes nothing, which is worse than
 * not offering it.
 */

import { houseCusps, moonLongitude, sunLongitude } from './swe.js';
import { moonPhase } from './lunar.js';

/**
 * The twelve signs.
 *
 * `element` is the Western four — fire, earth, air, water. **It is not 五行.**
 * The names collide in translation (西洋の火 and 五行の火) and the two schemes
 * are not the same idea: one has four with no generative cycle, the other five
 * with two. Anything that compares the systems has to refuse this bridge, so
 * the field is named `element` but the values are prefixed to make an
 * accidental comparison fail loudly rather than quietly agree.
 */
export const SIGNS = [
  { name: '牡羊座', element: 'west:fire', mode: 'cardinal', plain: '先に動く。始めるのが早く、終える前に次へ行く' },
  { name: '牡牛座', element: 'west:earth', mode: 'fixed', plain: '動かない。手ざわりと味を信じる' },
  { name: '双子座', element: 'west:air', mode: 'mutable', plain: '二つ持つ。喋って、繋いで、飽きる' },
  { name: '蟹座', element: 'west:water', mode: 'cardinal', plain: '内と外を分ける。身内には際限がない' },
  { name: '獅子座', element: 'west:fire', mode: 'fixed', plain: '中心に立つ。見られていると強い' },
  { name: '乙女座', element: 'west:earth', mode: 'mutable', plain: '細かく直す。粗いままにしておけない' },
  { name: '天秤座', element: 'west:air', mode: 'cardinal', plain: '釣り合いを取る。決めるのは最後' },
  { name: '蠍座', element: 'west:water', mode: 'fixed', plain: '深く入る。一度掴んだら離さない' },
  { name: '射手座', element: 'west:fire', mode: 'mutable', plain: '遠くへ行く。理屈より地平線' },
  { name: '山羊座', element: 'west:earth', mode: 'cardinal', plain: '積む。時間を味方につける' },
  { name: '水瓶座', element: 'west:air', mode: 'fixed', plain: '一歩ずれる。群れの外から見る' },
  { name: '魚座', element: 'west:water', mode: 'mutable', plain: '境が薄い。染まりやすく、包みやすい' },
];

const SIGN_SPAN = 30;

const norm360 = (deg) => ((deg % 360) + 360) % 360;
const signOf = (deg) => Math.floor(norm360(deg) / SIGN_SPAN);

/** Ascendant, in degrees of tropical longitude. Latitude first — see header. */
export function ascendantDegrees(jdUt, latDeg, lonDeg) {
  return norm360(houseCusps(jdUt, latDeg, lonDeg, 'P').ascmc[0]);
}

/**
 * Which signs a point occupies across a window, with each one's share.
 *
 * `at(jd)` must be increasing across the window — true of all three points over
 * the windows used here (the Sun and Moon never reverse over a day; the
 * ascendant is only ever asked over a few minutes). The boundary is found by
 * bisection on the same function that classifies, so the split and the label
 * cannot disagree.
 *
 * Sampling instead — checking the two ends and the middle — would miss a window
 * that crosses two boundaries and would place the split at whichever sample
 * happened to be nearest.
 */
function signSpread(at, from, to) {
  const out = [];
  let cursor = from;
  for (let guard = 0; guard < 14 && cursor < to; guard += 1) {
    const index = signOf(at(cursor));
    // The end of this sign, or the end of the window, whichever comes first.
    let end = to;
    if (signOf(at(to)) !== index) {
      let lo = cursor;
      let hi = to;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (signOf(at(mid)) === index) lo = mid; else hi = mid;
      }
      end = hi;
    }
    out.push({ index, sign: SIGNS[index], from: cursor, to: end, fraction: (end - cursor) / (to - from) });
    if (end >= to) break;
    cursor = end;
  }
  return out.sort((a, b) => b.fraction - a.fraction);
}

/** One point, resolved against the error bar. */
function resolve(at, jdUt, half) {
  const spread = signSpread(at, jdUt - half, jdUt + half);
  const index = signOf(at(jdUt));
  return {
    index,
    sign: SIGNS[index],
    // Position within the sign, 0 to 1. Near 0 or 1 is near a boundary, which
    // is where two tools that round differently start disagreeing.
    position: (norm360(at(jdUt)) % SIGN_SPAN) / SIGN_SPAN,
    degrees: norm360(at(jdUt)),
    spread,
    state: spread.length === 1 ? 'determinate' : 'boundary',
  };
}

/**
 * The three points for a birth.
 *
 * `minutes` is the recorded precision in minutes, or `null` for no recorded
 * time. `latitude` may be null; then there is no ascendant, and the reason is
 * carried rather than the field being silently absent.
 */
export function western(jdUt, { latitude, longitude, minutes }) {
  const half = (minutes === null ? 12 * 60 : minutes) / 1440;

  const sun = resolve(sunLongitude, jdUt, half);
  const moon = resolve(moonLongitude, jdUt, half);

  let ascendant = null;
  let ascendantMissing = null;
  if (minutes === null) {
    // Not a degraded answer — no answer. Twelve signs rise in a day.
    ascendantMissing = '生まれた時刻が要ります。アセンダントは一日で十二星座ぜんぶを一周するので、'
      + '時刻が無いと十二分の一の当てずっぽうにしかなりません。';
  } else if (!Number.isFinite(latitude)) {
    ascendantMissing = '生まれた場所の緯度が要ります。'
      + '同じ時刻でも、北にいるか南にいるかで昇ってくる星座が変わります。';
  } else {
    ascendant = resolve((j) => ascendantDegrees(j, latitude, longitude), jdUt, half);
    // How fast it is moving here, in degrees per half hour. This is the number
    // that says how much the birth time is being trusted, and it is measured
    // at this latitude on this day rather than quoted as a rule of thumb.
    const step = 30 / 1440;
    ascendant.degreesPerHalfHour = Math.abs(
      ((ascendantDegrees(jdUt + step, latitude, longitude)
        - ascendantDegrees(jdUt, latitude, longitude)) + 540) % 360 - 180,
    );
  }

  return { sun, moon, ascendant, ascendantMissing, phase: moonPhase(jdUt) };
}

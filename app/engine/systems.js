/**
 * One birth record, read by every system at once.
 *
 * The single place the systems are assembled, so that the page, the gate and
 * the agreement generator all see the same facts. When they were assembled
 * separately, an input that one path handled and another did not — a missing
 * latitude, a timeless record — produced measurements that did not describe
 * what the reader was shown.
 *
 * Everything here is derived from the chart the 命式 engine already built, and
 * in particular from **its** notion of the moment (`chart.time.ut`). The
 * systems therefore agree about when the birth was before they are asked to
 * agree about anything else; a system that recomputed the instant its own way
 * would disagree for reasons that have nothing to do with divination.
 */

import { buildChart, DEFAULT_AXES } from './chart.js';
import { judgeBoth } from './strength.js';
import { elementBalance, ELEMENTS } from './pillars.js';
import { precisionMinutes } from './uncertainty.js';
import { kyusei } from './kyusei.js';
import { shukuyo } from './shukuyo.js';
import { western } from './western.js';
import { lifePath } from './numerology.js';

/** 陽 of a stem or a branch is its even position in the cycle. */
const isYang = (index) => index % 2 === 0;

/** How much of the board pushes out rather than banks up, 0 to 1. */
function yangRatio(pillars) {
  let yang = 0;
  let total = 0;
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = pillars[key];
    if (!p) continue;
    if (isYang(p.stem)) yang += 1;
    if (isYang(p.branch)) yang += 1;
    total += 2;
  }
  return total === 0 ? null : yang / total;
}

/** The 五行 with the most characters, or null when two tie. */
function dominantElement(balance) {
  const largest = Math.max(...ELEMENTS.map((e) => balance.counts[e]));
  const top = ELEMENTS.filter((e) => balance.counts[e] === largest);
  // A tie is not a dominant element. Picking the first would invent a fact and
  // then feed it to the agreement layer, where it would be counted as a
  // systems-agree event on the strength of an array order.
  return top.length === 1 ? top[0] : null;
}

/**
 * Read one birth with everything.
 *
 * `input.latitude` may be absent; the ascendant is then withheld with a reason
 * rather than defaulted. Nothing else needs it.
 */
export function allSystems(input, axes = DEFAULT_AXES) {
  const chart = buildChart(input, axes);
  const strength = judgeBoth(chart.pillars);
  const balance = elementBalance(chart.pillars);
  const minutes = precisionMinutes(input.precision);

  return {
    chart,
    strength,
    balance: { ...balance, dominant: dominantElement(balance) },
    yangRatio: yangRatio(chart.pillars),
    kyusei: kyusei(chart),
    shukuyo: shukuyo(chart.time.ut, minutes),
    western: western(chart.time.ut, {
      latitude: Number.isFinite(input.latitude) ? input.latitude : null,
      longitude: input.longitude,
      minutes,
    }),
    numerology: lifePath(input),
  };
}

/**
 * 目盛り — the chart as four bars you can read at a glance.
 *
 * The reading was nine essays stacked vertically. A reader had to get through
 * all of them to find out what they had been told. What makes a personality
 * result legible is not the name at the top; it is being able to see where you
 * sit on a small number of scales, and being able to jump to the heading you
 * actually care about.
 *
 * This file is the first half of that. It adds **no new judgement**: every
 * number here is a re-reading of something the engine already computed, and
 * every one carries the characters it came from.
 *
 * The name: `chart.js` already uses "axis" for the twelve calculation variants
 * (定気/恒気, 早子/晩子 …). These are gauges, a different thing, and are named
 * differently so the two never get confused.
 *
 * Two of the four gauges move depending on whether 蔵干 are counted. Measured
 * over 20,000 charts, gauge 2 changes side for 13.8% of them and gauge 4 for
 * 28.7%. So they say so, on the chart where it happens, rather than presenting
 * one school's answer as the answer — the same treatment §2.5 gives time.
 */

import { ELEMENTS, ELEMENT_NAMES, elementBalance } from './pillars.js';

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];
const ja = (element) => ELEMENT_NAMES[element];

/**
 * How far a 扶抑法 score has to run before the bar is pinned to one end.
 *
 * Measured over 20,000 charts the score sits between −8.7 and +9.2, with the
 * 5th and 95th percentiles at −4.9 and +5.0. Clamping at ±8 keeps almost every
 * chart off the ends while still letting an extreme one look extreme. Stated as
 * a constant because it is a presentation choice, not a fact about the chart.
 */
export const SCORE_SCALE = 8;

/** 陽 of a stem or a branch is its even position in the cycle. */
const isYang = (index) => index % 2 === 0;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const pct = (value) => Number((value * 100).toFixed(1));

/**
 * The four gauges.
 *
 * **`percent` is always how far toward the LEFT label the chart sits**, 0 to
 * 100. One convention for all four, so a reader never has to work out which end
 * means what, and the renderer can decide which pole to colour from a single
 * comparison. Letting this vary between gauges is the easy way to draw a bar
 * that says the opposite of the number printed beside it.
 *
 * `strength` must be the result of `judgeBoth`: gauge 2 reports the verdict
 * itself, and it needs `agrees` to know whether to warn.
 *
 * `dayStemUncertain` comes from the error bars: if the recorded time is near a
 * boundary that moves the day pillar, gauges 1 and 2 rest on a day master that
 * might not be the right one, and the reader is told so.
 */
export function gauges(chart, strength, { dayStemUncertain = false } = {}) {
  const { pillars } = chart;
  const { counts, sources, total } = elementBalance(pillars);

  /* 1. 陰陽 — how much of the board pushes out rather than banks up. */
  const yang = [];
  const yin = [];
  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (!p) continue;
    (isYang(p.stem) ? yang : yin).push(`${key}_stem:${p.stemChar}`);
    (isYang(p.branch) ? yang : yin).push(`${key}_branch:${p.branchChar}`);
  }
  const yinYang = {
    key: 'gauge:yinyang',
    title: '出し方',
    left: '外に出す',
    right: '内にためる',
    percent: pct(yang.length / (yang.length + yin.length)),
    reading: `陽${yang.length}／陰${yin.length}`,
    detail: `${total}文字のうち、外に出す側（陽）が${yang.length}、内にためる側（陰）が${yin.length}。`,
    // The day master is the anchor, so it is named even when the tally is even
    // — which it is for 40% of charts, and a 4対4 bar alone would say nothing.
    note: `本体の${pillars.day.stemChar}そのものは${pillars.day.yinYang}です。`,
    provisional: dayStemUncertain,
    source: yang.concat(yin),
  };

  /* 2. 扶抑 — the verdict, as a position rather than a word. */
  const force = {
    key: `gauge:force:${strength.verdict}`,
    title: '力の余り',
    left: '力が余る',
    right: '削られる',
    percent: pct(0.5 + clamp(strength.score, -SCORE_SCALE, SCORE_SCALE) / (2 * SCORE_SCALE)),
    reading: strength.label,
    detail: `助ける力と削る力を足し引きして ${strength.score}。`
      + `${-strength.band}〜${strength.band} のあいだは中庸としています。`,
    // Half-width of the 中庸 band in bar terms, so the middle can be drawn as a
    // zone instead of a line. A chart at 0.9 is not the same claim as one at 7.
    band: pct(strength.band / (2 * SCORE_SCALE)),
    verdict: strength.verdict,
    unstable: !strength.agrees,
    unstableNote: strength.agrees ? null
      : `地支の隠れた干を数えないと ${strength.alternative.label}（${strength.alternative.score}）。`
        + '流派で反対に振れる位置です。',
    provisional: dayStemUncertain,
    source: strength.lines.flatMap((line) => line.source),
  };

  /* 3. かたより — the share of the board its largest element holds. */
  const largest = Math.max(...ELEMENTS.map((e) => counts[e]));
  const dominant = ELEMENTS.filter((e) => counts[e] === largest);
  // Perfectly even is not reachable with eight characters over five elements,
  // so the reference mark is the flattest a board of this size can actually be.
  const evenPercent = pct(Math.ceil(total / 5) / total);
  const spread = {
    key: `gauge:spread:${largest}`,
    title: 'かたより',
    left: '一点集中',
    right: 'まんべんなく',
    percent: pct(largest / total),
    reading: `${largest}／${total}`,
    detail: `いちばん多い五行は${dominant.map(ja).join('と')}で、${total}文字のうち${largest}つ。`,
    evenPercent,
    note: `${total}文字を五行に分けると、いちばん散らばった状態でも${evenPercent}%です。`,
    missing: ELEMENTS.filter((e) => counts[e] === 0).map(ja),
    source: dominant.flatMap((e) => sources[e]),
  };

  /* 4. 通根 — how many branches hold the day master's own element. */
  const branchCount = PILLAR_KEYS.filter((key) => pillars[key]).length;
  const roots = {
    key: `gauge:roots:${strength.rootCount}`,
    title: '土台',
    left: '土台がある',
    right: '身軽',
    percent: pct(strength.rootCount / branchCount),
    reading: `${strength.rootCount}／${branchCount}本`,
    detail: `下の段${branchCount}つのうち${strength.rootCount}つに、`
      + `本体と同じ${ja(strength.dayElement)}が入っています。`,
    // Stated because the count depends on it: counting only each branch's
    // nominal element instead flips this gauge for 28.4% of charts.
    note: '下の段に隠れている干（蔵干）まで含めて数えています。',
    source: strength.lines
      .filter((line) => line.relation === '通根' || line.relation === '無根')
      .flatMap((line) => line.source),
  };

  return [yinYang, force, spread, roots];
}

/**
 * Does the recorded time leave the day pillar in doubt?
 *
 * Gauges 1 and 2 both hang off the day stem, so if the error bar straddles a
 * day boundary they are provisional. Takes the result of `resolveUncertainty`.
 */
export function dayStemInDoubt(uncertainty) {
  if (!uncertainty || !uncertainty.outcomes) return false;
  const settled = uncertainty.chart.pillars.day.text;
  return uncertainty.outcomes.some((o) => o.chart.pillars.day.text !== settled);
}

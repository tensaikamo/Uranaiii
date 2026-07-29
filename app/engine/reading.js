/**
 * The reading layer (spec §8).
 *
 * One absolute rule governs this file: **no sentence may be emitted that is
 * not tied to concrete elements of the board.** A statement that would fit
 * anybody, wearing the face of a personal reading, is the only lie this app
 * can tell, and it ranks above factual error.
 *
 * So the rule is enforced structurally, not by good intentions:
 *
 *   - every statement carries a non-empty `source` array naming the characters
 *     and relations it came from;
 *   - `readChart` drops any statement whose sources are empty *at generation*,
 *     not in the UI, because hiding it in the UI would mean it still existed;
 *   - the sources are rendered next to the text, so the reader can check every
 *     sentence against the board themselves.
 *
 * Everything here is computed in the page. No model is called, so nothing about
 * the birth leaves the device (§7) and no API key is needed (§8.3).
 *
 * What this layer deliberately does NOT do: 蔵干, 通変星, 十二運 and 大運 are
 * out of scope for v1, so no rule may depend on them. And no rule states
 * anything about the person — only about the configuration on the board.
 */

import { ELEMENTS, ELEMENT_NAMES, elementBalance } from './pillars.js';

/** 相生 — each element generates the next. */
const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
/** 相剋 — each element controls the one it is paired against. */
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

const el = (e) => ELEMENT_NAMES[e];

const PILLAR_JA = { year: '年', month: '月', day: '日', hour: '時' };
const ORDER = ['year', 'month', 'day', 'hour'];

/** A statement, with the board elements it rests on. */
function say(text, source) {
  return { text, source };
}

/* --- the rules ------------------------------------------------------------
 * Each takes the chart and returns zero or more statements. A rule that does
 * not apply returns nothing; it never pads.
 */

/** 日主 — who the chart is reckoned from. */
function ruleDayMaster({ pillars }) {
  const d = pillars.day;
  return [say(
    `日主は${d.stemChar}${el(d.stemElement)}、${d.yinYang}。この一字を基準に盤を読む。`,
    [`day_stem:${d.stemChar}`, `element:${el(d.stemElement)}`, `polarity:${d.yinYang}`],
  )];
}

/**
 * 月令 — the day master's standing in the season the month branch names.
 * This is the shape of the spec's own worked example (§8.1).
 */
function ruleMonthCommand({ pillars }) {
  const day = pillars.day;
  const month = pillars.month;
  const me = day.stemElement;
  const season = month.branchElement;
  const head = `日主が${day.stemChar}${el(me)}、月支が${month.branchChar}で${el(season)}。`;
  const source = [
    `day_stem:${day.stemChar}`, `month_branch:${month.branchChar}`,
  ];

  if (me === season) {
    return [say(`${head}同じ${el(me)}が月令を占め、日主は季節に支えられる側に立つ。`,
      [...source, `relation:${el(me)}比和`])];
  }
  if (GENERATES[me] === season) {
    return [say(`${head}${el(me)}は${el(season)}を生じるため、日主は与える側に立ち、消耗しやすい配置になる。`,
      [...source, `relation:${el(me)}生${el(season)}`])];
  }
  if (GENERATES[season] === me) {
    return [say(`${head}${el(season)}が${el(me)}を生じるため、日主は季節から与えられる側に立つ。`,
      [...source, `relation:${el(season)}生${el(me)}`])];
  }
  if (CONTROLS[me] === season) {
    return [say(`${head}${el(me)}は${el(season)}を剋すため、日主は季節に働きかける側に立つ。`,
      [...source, `relation:${el(me)}剋${el(season)}`])];
  }
  return [say(`${head}${el(season)}が${el(me)}を剋すため、日主は季節に抑えられる側に立つ。`,
    [...source, `relation:${el(season)}剋${el(me)}`])];
}

/** The heaviest element on the board, named with the characters that make it. */
function ruleDominant(chart) {
  const { counts, sources, total } = elementBalance(chart.pillars);
  const peak = Math.max(...ELEMENTS.map((e) => counts[e]));
  if (peak < 3) return [];
  const heavy = ELEMENTS.filter((e) => counts[e] === peak);
  // elementBalance already labels each contributing character as e.g. 年干:庚,
  // which is exactly the citation this statement needs.
  return heavy.map((e) => say(
    `${total}字のうち${peak}字が${el(e)}（${sources[e].join('・')}）。${el(e)}に偏っている。`,
    [...sources[e], `element:${el(e)}`],
  ));
}

/** Elements the board does not contain at all. */
function ruleAbsent(chart) {
  const { counts, sources, total } = elementBalance(chart.pillars);
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  if (missing.length === 0) return [];
  // The evidence for an absence is the full set of characters that were read.
  const evidence = ELEMENTS.flatMap((e) => sources[e]);
  return [say(
    `${total}字を数えて、${missing.map(el).join('と')}が一字も無い。`,
    [...evidence.map((s) => `counted:${s.split(':')[1]}`), ...missing.map((e) => `absent:${el(e)}`)],
  )];
}

/** 干合 — the five stem pairs, wherever two of them stand side by side. */
function ruleStemUnion({ pillars }) {
  const out = [];
  for (let i = 0; i < ORDER.length - 1; i += 1) {
    const a = pillars[ORDER[i]];
    const b = pillars[ORDER[i + 1]];
    if (!a || !b) continue;
    if (Math.abs(a.stem - b.stem) !== 5) continue;
    out.push(say(
      `${PILLAR_JA[ORDER[i]]}干${a.stemChar}と${PILLAR_JA[ORDER[i + 1]]}干${b.stemChar}が隣り合って干合している。`,
      [`${ORDER[i]}_stem:${a.stemChar}`, `${ORDER[i + 1]}_stem:${b.stemChar}`,
        `relation:${a.stemChar}${b.stemChar}合`],
    ));
  }
  return out;
}

/** 冲 — the six opposing branch pairs, anywhere on the board. */
function ruleBranchClash({ pillars }) {
  const out = [];
  for (let i = 0; i < ORDER.length; i += 1) {
    for (let j = i + 1; j < ORDER.length; j += 1) {
      const a = pillars[ORDER[i]];
      const b = pillars[ORDER[j]];
      if (!a || !b) continue;
      if (Math.abs(a.branch - b.branch) !== 6) continue;
      out.push(say(
        `${PILLAR_JA[ORDER[i]]}支${a.branchChar}と${PILLAR_JA[ORDER[j]]}支${b.branchChar}が冲。`,
        [`${ORDER[i]}_branch:${a.branchChar}`, `${ORDER[j]}_branch:${b.branchChar}`,
          `relation:${a.branchChar}${b.branchChar}冲`],
      ));
    }
  }
  return out;
}

/** How the stems flanking the day master stand to it. */
function ruleNeighbourStems({ pillars }) {
  const day = pillars.day;
  const out = [];
  for (const key of ['month', 'hour']) {
    const other = pillars[key];
    if (!other) continue;
    const me = day.stemElement;
    const it = other.stemElement;
    if (me === it) continue; // 比和 adds nothing here
    let relation;
    let phrase;
    if (GENERATES[it] === me) { relation = `${el(it)}生${el(me)}`; phrase = '日主を生じる'; }
    else if (GENERATES[me] === it) { relation = `${el(me)}生${el(it)}`; phrase = '日主が生じる'; }
    else if (CONTROLS[it] === me) { relation = `${el(it)}剋${el(me)}`; phrase = '日主を剋す'; }
    else { relation = `${el(me)}剋${el(it)}`; phrase = '日主が剋す'; }
    out.push(say(
      `${PILLAR_JA[key]}干${other.stemChar}は${el(it)}で、${phrase}（${relation}）。`,
      [`day_stem:${day.stemChar}`, `${key}_stem:${other.stemChar}`, `relation:${relation}`],
    ));
  }
  return out;
}

export const RULES = [
  ruleDayMaster,
  ruleMonthCommand,
  ruleNeighbourStems,
  ruleDominant,
  ruleAbsent,
  ruleStemUnion,
  ruleBranchClash,
];

/**
 * Read a chart.
 *
 * The filter below is the whole safety property: a statement without sources
 * is destroyed here, at generation, and never reaches the caller. There is no
 * code path that renders one.
 */
export function readChart(chart) {
  const out = [];
  for (const rule of RULES) {
    for (const statement of rule(chart)) {
      if (!statement || !statement.text) continue;
      if (!Array.isArray(statement.source) || statement.source.length === 0) continue;
      out.push(statement);
    }
  }
  return out;
}

/**
 * The identity of a reading, for the discrimination measure.
 *
 * Taken from the *sources*, never the rendered text: measuring text would let
 * a rule inflate the score by rephrasing the same claim.
 */
export function readingSignature(statements) {
  return statements
    .map((s) => [...s.source].sort().join(','))
    .sort()
    .join('|');
}

/**
 * 身強・身弱 and 用神 — the verdict a reading is supposed to reach.
 *
 * Everything before this file describes the board. This is the one place that
 * *judges* it, and it is what a four-pillars reading actually turns on: how
 * strong the day master stands, and therefore which element the chart needs.
 * Without it a reading is a pile of observations with no through-line, which is
 * exactly what this app had.
 *
 * Method: 扶抑法 — weigh what supports the day master against what drains it,
 * and aim at 中庸, the middle. The four things that are weighed are the ones
 * the tradition weighs:
 *
 *   1. 月令   the season, by far the heaviest single factor
 *   2. 通根   whether the day stem finds its own element among the branches
 *   3. 生助   the other characters that share or generate the day master
 *   4. 洩剋   the other characters that drain, control, or are controlled
 *
 * Simplification, stated plainly: 蔵干 is out of scope for v1, so only the
 * visible element of each branch is counted. A full reading weighs the hidden
 * stems too, and near the boundary that can move the verdict. The score is
 * therefore always shown, never just the label — a reader can see how close to
 * the line they are, which is the same honesty the error bars apply to time.
 *
 * Schools differ on the weights. These are stated as constants rather than
 * buried in the arithmetic, so a disagreement can be located and argued with.
 */

import { ELEMENTS, ELEMENT_NAMES, elementBalance } from './pillars.js';

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
const el = (e) => ELEMENT_NAMES[e];

/** The month branch outweighs any other single character. */
const SEASON_WEIGHT = 3;
/** Every other character on the board counts once. */
const CHARACTER_WEIGHT = 1;
/** Controlling something costs the day master less than being controlled. */
const CONTROL_COST = 0.5;
/** The day stem finding its own element among the branches. */
const ROOT_BONUS = 1;
/** Inside this band the chart is called 中庸 rather than either extreme. */
const NEUTRAL_BAND = 1;

/** How one element stands to the day master, and what that is worth. */
function contribution(me, other) {
  if (me === other) return { score: 1, relation: '比和', note: '同じ五行。日主を強める' };
  if (GENERATES[other] === me) return { score: 1, relation: `${el(other)}生${el(me)}`, note: '日主を生じる。強める' };
  if (GENERATES[me] === other) return { score: -1, relation: `${el(me)}生${el(other)}`, note: '日主が生じる。洩らす' };
  if (CONTROLS[me] === other) return { score: -CONTROL_COST, relation: `${el(me)}剋${el(other)}`, note: '日主が剋す。力を使う' };
  return { score: -1, relation: `${el(other)}剋${el(me)}`, note: '日主を剋す。抑える' };
}

/**
 * Judge the chart.
 *
 * Returns the verdict, the score, every line of the arithmetic that produced
 * it, and the elements the chart needs and should avoid.
 */
export function judgeStrength(pillars) {
  const day = pillars.day;
  const me = day.stemElement;
  const lines = [];
  let score = 0;

  // 1. 月令 — the season.
  const season = pillars.month.branchElement;
  const seasonPart = contribution(me, season);
  const seasonScore = seasonPart.score * SEASON_WEIGHT;
  score += seasonScore;
  lines.push({
    label: `月支 ${pillars.month.branchChar}（${el(season)}）`,
    detail: `月令。${seasonPart.note}`,
    relation: seasonPart.relation,
    score: seasonScore,
    source: [`month_branch:${pillars.month.branchChar}`, `relation:${seasonPart.relation}`],
  });

  // 2. Every other character except the day stem itself and the month branch,
  //    which was already weighed as the season.
  const others = [];
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = pillars[key];
    if (!p) continue;
    if (key !== 'day') others.push({ char: p.stemChar, element: p.stemElement, label: `${label}干`, cite: `${key}_stem` });
    if (key !== 'month') others.push({ char: p.branchChar, element: p.branchElement, label: `${label}支`, cite: `${key}_branch` });
  }
  for (const o of others) {
    const part = contribution(me, o.element);
    const value = part.score * CHARACTER_WEIGHT;
    score += value;
    lines.push({
      label: `${o.label} ${o.char}（${el(o.element)}）`,
      detail: part.note,
      relation: part.relation,
      score: value,
      source: [`${o.cite}:${o.char}`, `relation:${part.relation}`],
    });
  }

  // 3. 通根 — does the day stem's element appear among the branches at all?
  const rootedIn = [];
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = pillars[key];
    if (p && p.branchElement === me) rootedIn.push({ label: `${label}支`, char: p.branchChar, cite: `${key}_branch` });
  }
  if (rootedIn.length > 0) {
    score += ROOT_BONUS;
    lines.push({
      label: `通根 ${rootedIn.map((r) => r.char).join('・')}`,
      detail: `日主と同じ${el(me)}が地支にある。根を張れている`,
      relation: '通根',
      score: ROOT_BONUS,
      source: rootedIn.map((r) => `${r.cite}:${r.char}`).concat('relation:通根'),
    });
  } else {
    lines.push({
      label: '通根 なし',
      detail: `地支に${el(me)}が一つも無い。根が無い`,
      relation: '無根',
      score: 0,
      source: [`day_stem:${day.stemChar}`, 'relation:無根'],
    });
  }

  const verdict = score > NEUTRAL_BAND ? 'strong' : score < -NEUTRAL_BAND ? 'weak' : 'neutral';

  // 用神 — what the chart needs to move toward the middle.
  // 身強 needs draining; 身弱 needs support. 中庸 needs whichever is scarcer.
  const strengthening = ELEMENTS.filter((e) => e === me || GENERATES[e] === me);
  const draining = ELEMENTS.filter((e) => !strengthening.includes(e));

  // A 中庸 chart still needs an answer: balance is the aim, so the element the
  // board has least of is the one to lean on. Leaving it blank would hand the
  // reader a verdict with nothing to do about it.
  const { counts } = elementBalance(pillars);
  const scarcest = Math.min(...ELEMENTS.map((e) => counts[e]));
  const scarce = ELEMENTS.filter((e) => counts[e] === scarcest);
  const abundant = ELEMENTS.filter((e) => counts[e] === Math.max(...ELEMENTS.map((x) => counts[x])));

  const needed = verdict === 'strong' ? draining : verdict === 'weak' ? strengthening : scarce;
  const avoided = verdict === 'strong' ? strengthening : verdict === 'weak' ? draining : abundant;

  return {
    verdict,
    label: { strong: '身強', weak: '身弱', neutral: '中庸' }[verdict],
    score: Number(score.toFixed(1)),
    band: NEUTRAL_BAND,
    lines,
    dayElement: me,
    needed,
    avoided,
    rooted: rootedIn.length > 0,
    counts,
    // How near the line the verdict sits. A chart at 1.5 is a different claim
    // from one at 7, and saying so is the same courtesy the error bars extend.
    margin: Number((Math.abs(score) - NEUTRAL_BAND).toFixed(1)),
  };
}

/** How this year's element stands to what the chart needs. */
export function yearFit(strength, yearElement) {
  if (strength.needed.includes(yearElement)) return 'needed';
  if (strength.avoided.includes(yearElement)) return 'avoided';
  return 'neutral';
}

export { el as elementName };

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
 * What is borrowed from how readings are actually delivered — and what is not.
 * Borrowed: put the whole before the parts, order by weight, group by theme,
 * open the jargon, and say how common a configuration is. Not borrowed: any
 * claim about the person, any prediction, any advice, any warmth. Those are
 * the cold-reading toolkit, which is exactly what §8 exists to refuse.
 *
 * Saying how rare a configuration is deserves its own note: it is the honest
 * form of "this is significant", it is measured rather than asserted (see
 * rarity.js), and it works *against* the Barnum effect. "水が3字" feels like a
 * revelation until you are told a quarter of all charts have it.
 *
 * Everything here is computed in the page. No model is called, so nothing about
 * the birth leaves the device (§7) and no API key is needed (§8.3).
 *
 * Out of scope for v1, so no rule may depend on them: 蔵干, 通変星, 十二運, 大運.
 */

import { ELEMENTS, ELEMENT_NAMES, elementBalance } from './pillars.js';
import { frequencyOf } from './rarity.js';

/** 相生 — each element generates the next. */
const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
/** 相剋 — each element controls the one it is paired against. */
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

const el = (e) => ELEMENT_NAMES[e];

const PILLAR_JA = { year: '年', month: '月', day: '日', hour: '時' };
const ORDER = ['year', 'month', 'day', 'hour'];

/**
 * The three headings a reading is delivered under, in order.
 * The core first, then what the board does with it, then the balance — the
 * whole before the parts.
 */
export const GROUPS = [
  { key: 'core', label: '軸', note: 'この盤を読む起点' },
  { key: 'relation', label: '関係', note: '柱どうしが結ぶ／衝く' },
  { key: 'balance', label: '偏り', note: '八字の五行の数' },
];

/** Plain-language glosses, so the reading does not hide behind its vocabulary. */
export const GLOSSARY = [
  ['日主', '生まれた日の天干。四柱推命はこの一字を「自分」に当てて、他の七字との関係を読む。'],
  ['月令', '生まれた月の地支が示す季節。日主がその季節の五行とどう関係するかを見る。'],
  ['相生', '木→火→土→金→水→木 の順で、前が後を生む関係。'],
  ['相剋', '木→土→水→火→金→木 の順で、前が後を抑える関係。'],
  ['干合', '十干のうち定まった五組（甲己・乙庚・丙辛・丁壬・戊癸）が隣り合うこと。'],
  ['冲', '向かい合う地支の六組（子午・丑未・寅申・卯酉・辰戌・巳亥）が同じ盤にあること。'],
];

/** A statement, with the board elements it rests on. */
function say({ text, source, group, key }) {
  return { text, source, group, key };
}

/* --- the rules ------------------------------------------------------------
 * Each takes the chart and returns zero or more statements, in the order they
 * should be read. A rule that does not apply returns nothing; it never pads.
 */

/** 日主 — who the chart is reckoned from. */
function ruleDayMaster({ pillars }) {
  const d = pillars.day;
  return [say({
    text: `日主は${d.stemChar}。${el(d.stemElement)}の${d.yinYang}。四柱推命はこの一字を自分に当て、残る七字との関係で盤を読む。`,
    source: [`day_stem:${d.stemChar}`, `element:${el(d.stemElement)}`, `polarity:${d.yinYang}`],
    group: 'core',
    key: `dayMaster:${d.stemChar}`,
  })];
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
  const head = `月支は${month.branchChar}で、季節の五行は${el(season)}。`;
  const source = [`day_stem:${day.stemChar}`, `month_branch:${month.branchChar}`];
  const build = (relation, tail) => [say({
    text: head + tail,
    source: [...source, `relation:${relation}`],
    group: 'core',
    key: `monthCommand:${relation}`,
  })];

  if (me === season) {
    return build(`${el(me)}比和`,
      `日主の${el(me)}と同じ五行が季節を占めており、日主は季節に支えられる側に立つ。`);
  }
  if (GENERATES[me] === season) {
    return build(`${el(me)}生${el(season)}`,
      `${el(me)}は${el(season)}を生じる（相生）。日主は与える側に立ち、消耗しやすい配置になる。`);
  }
  if (GENERATES[season] === me) {
    return build(`${el(season)}生${el(me)}`,
      `${el(season)}は${el(me)}を生じる（相生）。日主は季節から与えられる側に立つ。`);
  }
  if (CONTROLS[me] === season) {
    return build(`${el(me)}剋${el(season)}`,
      `${el(me)}は${el(season)}を剋す（相剋）。日主は季節に働きかける側に立つ。`);
  }
  return build(`${el(season)}剋${el(me)}`,
    `${el(season)}は${el(me)}を剋す（相剋）。日主は季節に抑えられる側に立つ。`);
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
    if (me === it) continue; // 比和 adds nothing beyond the balance count
    let relation;
    let phrase;
    if (GENERATES[it] === me) { relation = `${el(it)}生${el(me)}`; phrase = '日主を生じる'; }
    else if (GENERATES[me] === it) { relation = `${el(me)}生${el(it)}`; phrase = '日主が生じる'; }
    else if (CONTROLS[it] === me) { relation = `${el(it)}剋${el(me)}`; phrase = '日主を剋す'; }
    else { relation = `${el(me)}剋${el(it)}`; phrase = '日主が剋す'; }
    out.push(say({
      text: `隣の${PILLAR_JA[key]}干は${other.stemChar}、${el(it)}。${phrase}（${relation}）。`,
      source: [`day_stem:${day.stemChar}`, `${key}_stem:${other.stemChar}`, `relation:${relation}`],
      group: 'relation',
      key: `neighbour:${key}:${phrase}`,
    }));
  }
  return out;
}

/** 干合 — the five stem pairs, wherever two of them stand side by side. */
function ruleStemUnion({ pillars }) {
  const out = [];
  for (let i = 0; i < ORDER.length - 1; i += 1) {
    const a = pillars[ORDER[i]];
    const b = pillars[ORDER[i + 1]];
    if (!a || !b) continue;
    if (Math.abs(a.stem - b.stem) !== 5) continue;
    out.push(say({
      text: `${PILLAR_JA[ORDER[i]]}干${a.stemChar}と${PILLAR_JA[ORDER[i + 1]]}干${b.stemChar}が隣り合い、干合の組になっている。`,
      source: [`${ORDER[i]}_stem:${a.stemChar}`, `${ORDER[i + 1]}_stem:${b.stemChar}`,
        `relation:${a.stemChar}${b.stemChar}合`],
      group: 'relation',
      key: `stemUnion:${a.stemChar}${b.stemChar}`,
    }));
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
      out.push(say({
        text: `${PILLAR_JA[ORDER[i]]}支${a.branchChar}と${PILLAR_JA[ORDER[j]]}支${b.branchChar}が向かい合い、冲の組になっている。`,
        source: [`${ORDER[i]}_branch:${a.branchChar}`, `${ORDER[j]}_branch:${b.branchChar}`,
          `relation:${a.branchChar}${b.branchChar}冲`],
        group: 'relation',
        key: `branchClash:${a.branchChar}${b.branchChar}`,
      }));
    }
  }
  return out;
}

/** The heaviest element on the board, named with the characters that make it. */
function ruleDominant(chart) {
  const { counts, sources, total } = elementBalance(chart.pillars);
  const peak = Math.max(...ELEMENTS.map((e) => counts[e]));
  if (peak < 3) return [];
  const heavy = ELEMENTS.filter((e) => counts[e] === peak);
  // elementBalance already labels each contributing character as e.g. 年干:庚,
  // which is exactly the citation this statement needs.
  return heavy.map((e) => say({
    text: `${total}字のうち${peak}字が${el(e)}。${sources[e].join('・')}の${peak}字。`,
    source: [...sources[e], `element:${el(e)}`],
    group: 'balance',
    key: `dominant:${el(e)}:${peak}`,
  }));
}

/** Elements the board does not contain at all. */
function ruleAbsent(chart) {
  const { counts, sources, total } = elementBalance(chart.pillars);
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  if (missing.length === 0) return [];
  // The evidence for an absence is the full set of characters that were read.
  const evidence = ELEMENTS.flatMap((e) => sources[e]);
  return [say({
    text: `${total}字を数えて、${missing.map(el).join('と')}が一字も無い。`,
    source: [...evidence.map((s) => `counted:${s.split(':')[1]}`), ...missing.map((e) => `absent:${el(e)}`)],
    group: 'balance',
    key: `absent:${missing.map(el).join('')}`,
  })];
}

export const RULES = [
  ruleDayMaster,
  ruleMonthCommand,
  ruleNeighbourStems,
  ruleStemUnion,
  ruleBranchClash,
  ruleDominant,
  ruleAbsent,
];

const GROUP_RANK = Object.fromEntries(GROUPS.map((g, i) => [g.key, i]));

/**
 * Statements before rarity is attached.
 * Exported for tools/build-rarity.mjs, which must not depend on the table it
 * is about to write.
 */
export function rawStatements(chart) {
  const out = [];
  for (const rule of RULES) {
    for (const statement of rule(chart)) {
      if (!statement || !statement.text) continue;
      // The safety property: a statement without sources is destroyed here, at
      // generation. There is no code path that renders one.
      if (!Array.isArray(statement.source) || statement.source.length === 0) continue;
      out.push(statement);
    }
  }
  return out;
}

/**
 * Read a chart.
 *
 * Statements come back grouped and, within a group, rarest first — an unusual
 * configuration is the part of a chart worth looking at, and burying it under
 * something four charts in five share would be poor communication.
 */
export function readChart(chart) {
  const statements = rawStatements(chart).map((s) => ({ ...s, frequency: frequencyOf(s.key) }));

  return statements.sort((a, b) => {
    const byGroup = GROUP_RANK[a.group] - GROUP_RANK[b.group];
    if (byGroup !== 0) return byGroup;
    const fa = a.frequency === null ? 1 : a.frequency;
    const fb = b.frequency === null ? 1 : b.frequency;
    return fa - fb;
  });
}

/**
 * The one-line synthesis a reading opens with.
 *
 * Built only from the two facts every chart has — the day master and the month
 * branch — so it is always sourced and never reaches for something that is not
 * on the board.
 */
export function summarise(chart) {
  const day = chart.pillars.day;
  const month = chart.pillars.month;
  return {
    text: `${el(day.stemElement)}の日主が、${el(month.branchElement)}の季節に生まれている。`,
    source: [`day_stem:${day.stemChar}`, `month_branch:${month.branchChar}`],
  };
}

/**
 * How common a statement is, in natural frequency.
 * "およそ4件に1件" rather than "25%" — the same rule the error bars follow.
 */
export function describeFrequency(frequency) {
  if (frequency === null || frequency <= 0) return null;
  if (frequency >= 0.995) return 'ほぼ全ての命式にある';
  const oneIn = Math.round(1 / frequency);
  if (oneIn <= 1) return 'ほぼ全ての命式にある';
  return `およそ${oneIn}件に1件`;
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

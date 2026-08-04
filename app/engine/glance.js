/**
 * 一目で分かる層 — the four seconds before anyone starts reading.
 *
 * Everything this app computes was already correct and already sourced. It was
 * also, in the author's words, 微妙でわかりづらい — and that was fair. Every page
 * opened with a form, then a caveat, then paragraphs. Nothing told you what you
 * had been told.
 *
 * Popular divination solves this and does it in ways worth borrowing:
 *
 *   動物占い     形容詞＋名詞. 「長距離ランナーのチータ」 — a name you can say out
 *                loud. This app had 「夏の珠玉」, a noun, buried mid-page.
 *   六星占術     twelve phases folded into a handful of named eras. This app had
 *                a ninety-cell band with no grouping at all.
 *   日々の占い    a line for today, and a do / don't. Something to act on.
 *
 * **Nothing here computes a new judgement.** Every field is a re-presentation of
 * a value the engine already produced, and carries the same `source[]` the rest
 * of the app requires, so a reader can still walk any of it back to the 八字.
 * What changed is the order and the size, which is the whole of what was wrong.
 */

import { ELEMENT_PLAIN, VERDICT_PLAIN } from './plainwords.js';
import { ELEMENTS } from './pillars.js';
import { typeName } from './voice.js';

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

/** Same relation vocabulary domains.js reads palaces with. */
function relationTo(me, other) {
  if (me === other) return '比和';
  if (GENERATES[other] === me) return '生我';
  if (GENERATES[me] === other) return '我生';
  if (CONTROLS[me] === other) return '我剋';
  return '剋我';
}

/**
 * The adjective phrase in front of the type name.
 *
 * Keyed on 判定 × 用神 — the two things the engine treats as its conclusion, so
 * the headline is the conclusion said in four words rather than a fifth opinion
 * layered on top. Five elements × three verdicts = fifteen phrases, against the
 * forty type names, so the pair does not collapse to a handful of outcomes.
 */
const HEADLINE = {
  strong: {
    wood: '押し出す力が余っている',
    fire: '出しきって軽くなる',
    earth: '受けとめる側に回ると効く',
    metal: '締めると形になる',
    water: '流しておくと澱まない',
  },
  weak: {
    wood: '伸ばしてもらうと強くなる',
    fire: '温めてもらうと動ける',
    earth: '積み上げて強くなる',
    metal: '芯を入れると立てる',
    water: '注いでもらうと回る',
  },
  neutral: {
    wood: '傾けたほうへ伸びる',
    fire: '見せる場があると効く',
    earth: '置き場所を決めると効く',
    metal: '決めると早い',
    water: '流れを選べる',
  },
};

/**
 * The one line a reader leaves with.
 *
 * 形容詞句 — 型名. The dash matters: it is two facts joined, not a slogan.
 */
export function headline(chart, strength) {
  const type = typeName(chart);
  const need = strength.needed.length ? strength.needed[0] : null;
  const phrases = HEADLINE[strength.verdict];
  const phrase = need && phrases ? phrases[need] : null;
  if (!phrase) return null;
  return {
    phrase,
    type: type.name,
    text: `${phrase} — ${type.name}`,
    tag: type.tag,
    source: [...type.source, `judgement:${VERDICT_PLAIN[strength.verdict].term}`, `needed:${ELEMENT_PLAIN[need].name}`],
    // Keyed on the whole line, because the whole line is what a reader sees.
    // Keying the phrase alone would put "one in four" beside a sentence that
    // also names one of forty types — a frequency for half the claim, which
    // reads as a frequency for all of it.
    key: `glance:headline:${strength.verdict}:${need}:${type.season}:${type.name}`,
  };
}

/* --- ◎○△ ---------------------------------------------------------------- */

/**
 * The marks are **relative to this chart's own four settings**, not absolute.
 *
 * The first version compared each setting's element against 用神 and 忌神
 * directly, which sounds right and measures terribly: a 身弱 chart avoids three
 * of the five elements, so 76% of everybody got △ on 仕事 and the commonest row
 * of all was △△△△ at 16%. That table is not reporting the setting, it is
 * reporting the shape of the verdict — and it reads as "your work life is bad"
 * to three readers in four.
 *
 * Ranking the four against each other fixes both problems at once, and it is
 * the more honest claim as well: ◎ here means "of your four, this is the one
 * the wind is behind", which is what a reader takes from a symbol table anyway.
 * Nothing new is computed — it is an ordering of values `strength.js` already
 * produced.
 *
 * When all four score the same there is nothing to rank, and they all get ○
 * rather than an invented spread.
 */
export const MARK_SCALE = [
  { mark: '◎', word: '追い風', note: 'あなたの4つの中では、いちばん風が味方している場面です' },
  { mark: '○', word: 'ふつう', note: '4つの中では、押しも引きもしない場面です' },
  { mark: '△', word: '手がいる', note: 'あなたの4つの中では、いちばん手をかける必要がある場面です' },
  { mark: '—', word: '出せない', note: '記録にその柱がありません' },
];

const MARK_BY_KEY = Object.fromEntries(MARK_SCALE.map((m) => [m.mark, m]));

/** Which pillar governs which setting — the received allocation domains.js uses. */
const PALACE_PILLAR = { work: 'month', people: 'day', body: 'hour' };

const DOMAIN_LABEL = {
  work: '仕事', people: '人づきあい・恋愛', money: 'お金', body: '心と体',
};

/**
 * A mark per setting, so the four can be read without reading.
 *
 * The element that governs each setting is compared against what the chart
 * needs and what it is worn down by — both already computed by `strength.js`.
 * 仕事/人づきあい/心と体 read their palace's branch; お金 has no palace and reads
 * the board's most common element, exactly as `domains.js` does.
 *
 * **A timeless record gets 「—」 for 心と体**, not a guess. Filling it would be
 * the same failure as inventing an ascendant, and it is the failure a symbol
 * table invites most, because a dash looks like a defect and a ○ looks like an
 * answer.
 */
export function marks(chart, strength, balance) {
  const me = chart.pillars.day.stemElement;
  const out = [];

  for (const key of ['work', 'people', 'money', 'body']) {
    let element = null;
    let source = null;

    if (key === 'money') {
      const largest = Math.max(...ELEMENTS.map((e) => balance.counts[e]));
      const top = ELEMENTS.filter((e) => balance.counts[e] === largest);
      // A tie is not a most-common element; the mark says so rather than
      // picking whichever the array happened to list first.
      if (top.length === 1) {
        [element] = top;
        source = `dominant:${ELEMENT_PLAIN[element].name}`;
      }
    } else {
      const pillar = chart.pillars[PALACE_PILLAR[key]];
      if (pillar) {
        element = pillar.branchElement;
        source = `${PALACE_PILLAR[key]}_branch:${pillar.branchChar}`;
      }
    }

    if (!element) {
      out.push({
        key, label: DOMAIN_LABEL[key], ...MARK_BY_KEY['—'], element: null, score: null,
        source: [key === 'money' ? 'dominant:同数' : `${PALACE_PILLAR[key]}_branch:なし`],
        statementKey: `glance:mark:${key}:none`,
      });
      continue;
    }

    out.push({
      key,
      label: DOMAIN_LABEL[key],
      element,
      elementName: ELEMENT_PLAIN[element].name,
      relation: relationTo(me, element),
      score: strength.needed.includes(element) ? 1 : (strength.avoided.includes(element) ? -1 : 0),
      source: [source, `judgement:${VERDICT_PLAIN[strength.verdict].term}`],
    });
  }

  // Rank what could be scored. The marks describe positions within this chart,
  // so a setting that could not be scored takes no position and does not shift
  // anyone else's.
  const scored = out.filter((m) => m.score !== null);
  const best = Math.max(...scored.map((m) => m.score));
  const worst = Math.min(...scored.map((m) => m.score));

  for (const item of scored) {
    // Everything level: nothing to rank, so nothing is claimed.
    const mark = best === worst ? '○'
      : (item.score === best ? '◎' : (item.score === worst ? '△' : '○'));
    Object.assign(item, MARK_BY_KEY[mark]);
    item.statementKey = `glance:mark:${item.key}:${
      best === worst ? 'level' : (mark === '◎' ? 'best' : (mark === '△' ? 'worst' : 'mid'))}`;
  }
  return out;
}

/* --- 時期を畳む ----------------------------------------------------------- */

export const ERA_NAMES = {
  needed: { name: '伸ばす期', note: '巡ってきている五行が、この盤の要るものと合っています' },
  neutral: { name: '整える期', note: '押しも引きもしない期間です' },
  avoided: { name: '守る期', note: '巡ってきている五行が、この盤を消耗させる側です' },
  // 大運 starts at 立運, which can be eight years after birth. Those years
  // belong to no cycle, and the band already draws them as `before` rather than
  // stretching the first cycle backwards. The eras have to cover them too, or
  // a reader young enough to be in them finds themselves in no era at all.
  before: { name: '大運前', note: '十年の巡りが始まる前です。追い風も向かい風も主張しません' },
};

/**
 * Fold the 大運 into a few named eras.
 *
 * The band draws ninety cells. Ninety cells is a data structure, not a reading:
 * nobody looks at it and knows what part of their life they are in. 六星占術
 * gets read because twelve phases arrive pre-grouped into four.
 *
 * So consecutive cycles sharing a `fit` are merged and named. **The count is
 * whatever the chart produces** — usually three to six — rather than forced to
 * four. Forcing four would mean inventing a category boundary that no rule puts
 * there, and the borrowed thing here is the *folding*, not the number.
 *
 * The names are this app's own. 六星占術's vocabulary (上昇期, 大殺界 …) belongs
 * to a commercial system and carries claims that are not being made here.
 */
export function eras(luck) {
  if (!luck || !luck.periods || luck.periods.length === 0) return [];
  const out = [];

  // The stretch before 立運, so the eras cover a life from age 0 with no gap.
  const start = luck.periods[0].fromAge + (luck.periods[0].fromMonths || 0) / 12;
  if (start > 0) {
    out.push({
      fit: 'before', ...ERA_NAMES.before, fromAge: 0, toAge: start, cycles: [],
    });
  }

  for (const cycle of luck.periods) {
    const fit = cycle.fit || 'neutral';
    const from = cycle.fromAge + (cycle.fromMonths || 0) / 12;
    const last = out[out.length - 1];
    if (last && last.fit === fit) {
      last.toAge = cycle.toAge;
      last.cycles.push(cycle);
    } else {
      out.push({ fit, ...ERA_NAMES[fit], fromAge: from, toAge: cycle.toAge, cycles: [cycle] });
    }
  }

  return out.map((era) => ({
    ...era,
    // The pre-立運 stretch is sourced on the onset itself, not on a cycle it
    // deliberately has none of; a statement with an empty source[] is dropped
    // by the caller, and this one is a real claim about a real interval.
    source: era.cycles.length
      ? era.cycles.map((c) => `luck:${c.pillar.text}`)
      : [`立運:${luck.onset.years}歳${luck.onset.months}ヶ月`],
    key: `glance:era:${era.fit}`,
  }));
}

/** Which era contains a given age. */
export function eraAt(list, age) {
  return list.find((era) => age >= era.fromAge && age < era.toAge) || null;
}

/* --- 今日 ---------------------------------------------------------------- */

/**
 * Today, as two short lists.
 *
 * `timeline.js` already decides whether today's element is one the chart needs
 * or one it is worn down by. This turns that single fact into the shape people
 * actually use — one thing to do, one thing to leave alone — using the action
 * words `plainwords.js` already carries for each element.
 */
export function todayActions(strength, todayElement) {
  if (!todayElement) return null;
  const fit = strength.needed.includes(todayElement) ? 'needed'
    : (strength.avoided.includes(todayElement) ? 'avoided' : 'neutral');

  const need = strength.needed[0] || null;
  const avoid = strength.avoided[0] || null;

  return {
    fit,
    element: todayElement,
    elementName: ELEMENT_PLAIN[todayElement].name,
    headline: {
      needed: '追い風の日です。',
      neutral: '押しも引きもない日です。',
      avoided: '向かい風の日です。',
    }[fit],
    // The do and the don't come from the chart, not from the day: what helps
    // this chart helps it on any day. The day only sets how hard it is.
    doThis: need ? ELEMENT_PLAIN[need].doing : null,
    doElement: need,
    avoidThis: avoid ? ELEMENT_PLAIN[avoid].doing : null,
    avoidElement: avoid,
    source: [`today:${ELEMENT_PLAIN[todayElement].name}`, `judgement:${VERDICT_PLAIN[strength.verdict].term}`],
    key: `glance:today:${fit}`,
  };
}

/** Every statement key this layer can produce, for the frequency table. */
export function glanceStatements(chart, strength, balance, { luck = null, todayElement = null, age = null } = {}) {
  const out = [];
  const head = headline(chart, strength);
  if (head) out.push({ key: head.key, source: head.source });
  for (const mark of marks(chart, strength, balance)) {
    out.push({ key: mark.statementKey, source: mark.source });
  }

  // **Only the era the reader is standing in.** Emitting one key per era
  // measured 100% for 伸ばす期 and 守る期, which is true and useless: across
  // ninety years everybody passes through both. The page does not claim "you
  // have a 伸ばす期 somewhere", it claims 「いまは【守る期】」 — so that is the
  // statement, and its frequency is the share of people in that era today.
  // The key has to name the claim, not the chart; this repository has now made
  // that mistake three times.
  const list = eras(luck);
  const current = age == null ? null : eraAt(list, age);
  if (current) out.push({ key: current.key, source: current.source });

  const today = todayActions(strength, todayElement);
  if (today) out.push({ key: today.key, source: today.source });
  return out.filter((s) => s.source && s.source.length > 0);
}

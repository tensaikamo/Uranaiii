/**
 * 一致度 — when two systems point the same way, how often does that happen
 * anyway?
 *
 * ## The problem this exists to solve
 *
 * Stacking divination systems does not make a reading more accurate. It makes
 * it *feel* more accurate, which is worse, because the feeling comes from
 * exactly the thing this app is built against: five systems produce five times
 * as many statements, some of them will rhyme, and the reader supplies the
 * significance. "四柱推命でも九星でも土が出ています" lands hard. It lands just as
 * hard when the two systems agree about土 for two people in five.
 *
 * So every agreement this file reports carries **the rate at which it happens
 * by chance**, measured over 20,000 charts by `tools/build-agreement.mjs`. Not
 * derived, not assumed uniform — measured, because the systems are not
 * uniform and some of them are not independent.
 *
 * > 四柱推命の用神と九星の本命星が同じ五行を指しています。
 * > これは20,000人中 2,314人（11.6%）で起きます。
 *
 * A reader can then decide what an 11.6% coincidence is worth. That is a
 * different offer from "the systems agree!", and it is the only one this app
 * can make honestly.
 *
 * ## What may be compared, and what may not
 *
 * Only projections onto a shared question count. Two rules:
 *
 * **五行 is shared; the Western four elements are not.** 九星 carries 木火土金水,
 * the same five with the same generating and overcoming cycles, so comparing it
 * with 用神 is comparing like with like. The Western fire/earth/air/water is
 * four, with no such cycles, and 火 and fire are cognate only in translation.
 * `western.js` prefixes its values (`west:fire`) so that an accidental
 * comparison fails to match rather than quietly matching.
 *
 * **Polarity is a shared question, asked separately by each tradition.** 陰陽 in
 * 四柱推命 and the odd/even (positive/negative) division of the zodiac are not
 * the same concept and this file does not claim they are. They are two
 * traditions independently sorting people into outward and inward. Asking
 * whether they land on the same side is a legitimate question precisely
 * because we then measure how often they do — and if the answer is "half the
 * time", that is chance, and the reading says chance.
 *
 * ## Systems that answer no shared question at all
 *
 * 宿曜 is here and compares with nothing. A 宿 is one of 27 sidereal divisions;
 * the nearest thing elsewhere is the Western moon sign, one of 12 tropical
 * ones, offset by the ayanāṃśa. "Are they the same" is not a question those two
 * can be asked. Giving the mansions a 五行 so they could join the element
 * comparison would be inventing the bridge this file spends its header
 * refusing — the tradition attaches 七曜 and 三性 to them, not 木火土金水.
 *
 * That is a finding, not a gap: 宿曜 says something nothing else here says, and
 * corroborates nothing. Same for the ascendant. A system that cannot be checked
 * against another is not thereby weaker — it is just alone, and the page says
 * so rather than manufacturing a comparison to fill the row.
 */

import { ELEMENT_NAMES } from './pillars.js';

/**
 * The comparable projections.
 *
 * Each one reduces a system to an answer to a shared question. `question`
 * identifies what is being asked, and only claims sharing a question are ever
 * compared. Returning `null` means this chart does not answer it — a timeless
 * record has no ascendant, and no answer is not a disagreement.
 */
export const PROJECTIONS = [
  {
    key: 'meishiki:needed',
    system: '四柱推命',
    question: 'element',
    label: 'この盤に効く五行（用神）',
    of: ({ strength }) => (strength && strength.needed.length ? strength.needed[0] : null),
  },
  {
    key: 'meishiki:dominant',
    system: '四柱推命',
    question: 'element',
    label: 'いちばん多い五行',
    of: ({ balance }) => (balance ? balance.dominant : null),
  },
  {
    key: 'kyusei:year',
    system: '九星気学',
    question: 'element',
    label: '本命星の五行',
    of: ({ kyusei: k }) => (k ? k.year.element : null),
  },
  {
    key: 'kyusei:month',
    system: '九星気学',
    question: 'element',
    label: '月命星の五行',
    of: ({ kyusei: k }) => (k ? k.month.element : null),
  },
  {
    key: 'meishiki:polarity',
    system: '四柱推命',
    question: 'polarity',
    label: '八字の陰陽の傾き',
    of: ({ yangRatio }) => (yangRatio == null ? null : (yangRatio > 0.5 ? 'out' : (yangRatio < 0.5 ? 'in' : null))),
  },
  {
    key: 'western:sun',
    system: '西洋占星術',
    question: 'polarity',
    label: '太陽星座の極性',
    // The classical division: odd signs (fire, air) outward, even (earth,
    // water) inward. Not 陰陽 — a separate tradition asking a similar question.
    of: ({ western: w }) => (w ? (w.sun.index % 2 === 0 ? 'out' : 'in') : null),
  },
  {
    key: 'western:moon',
    system: '西洋占星術',
    question: 'polarity',
    label: '月星座の極性',
    of: ({ western: w }) => (w ? (w.moon.index % 2 === 0 ? 'out' : 'in') : null),
  },
  {
    key: 'numerology:polarity',
    system: '数秘術',
    question: 'polarity',
    label: 'ライフパスの奇偶',
    // Odd numbers active, even receptive — the tradition's own division, not one
    // invented here to make a comparison possible. This is the thin system, and
    // it is on the board deliberately: if the two thick systems agree with each
    // other no more than a digit sum agrees with either, that is the most
    // useful thing this layer can tell anybody.
    of: ({ numerology: n }) => (n ? (n.number % 2 === 1 ? 'out' : 'in') : null),
  },
];

/** Pairs that share a question, with the ones that are not independent named. */
export function comparablePairs() {
  const pairs = [];
  for (let i = 0; i < PROJECTIONS.length; i += 1) {
    for (let j = i + 1; j < PROJECTIONS.length; j += 1) {
      const a = PROJECTIONS[i];
      const b = PROJECTIONS[j];
      if (a.question !== b.question) continue;
      // Two readings of one system agreeing with each other says nothing about
      // systems agreeing at all.
      if (a.system === b.system) continue;
      pairs.push({ a, b, key: `${a.key}|${b.key}` });
    }
  }
  return pairs;
}

/**
 * Pairs whose agreement is arithmetic rather than corroboration, and why.
 *
 * Keyed by the pair key so that adding a projection cannot silently create a
 * non-independent pair that nothing flags.
 *
 * **Empty, and the reason is worth recording.** The header above describes
 * 宿曜's mansion and the Western moon sign as the obvious non-independent
 * pair — both are cuts of the same lunar longitude — and this table was written
 * to flag it. The gate then failed, correctly: the pair does not exist, because
 * **宿曜 is not comparable with anything here at all.**
 *
 * A 宿 is one of 27 sidereal divisions and a sign is one of 12 tropical ones,
 * offset by the ayanāṃśa. Equality between them is not a question that can be
 * asked. Giving 宿 a 五行 so it could join the element comparison is exactly the
 * invented bridge this file refuses elsewhere — the tradition attaches 七曜 and
 * 三性 to the mansions, not 木火土金水.
 *
 * So 宿曜 stands alone: it says something no other system here says, and it
 * corroborates nothing, which is a fact about the systems rather than a gap in
 * this file. The mechanism stays because the moment a projection is added that
 * *does* create a non-independent pair, it has to be labelled rather than read
 * as two systems agreeing.
 */
export const STRUCTURAL = {};

const answers = (facts) => {
  const out = new Map();
  for (const p of PROJECTIONS) {
    const value = p.of(facts);
    if (value != null) out.set(p.key, value);
  }
  return out;
};

/**
 * Which comparable pairs agree for this chart.
 *
 * `rates` is the measured table from `agreementRates.js`; without it the
 * agreements are still found but carry no frequency, and a caller that cannot
 * state the chance rate should not be stating the agreement either — so
 * `frequency` is null rather than absent and the reading layer drops it.
 */
export function agreements(facts, rates = {}) {
  const found = answers(facts);
  const out = [];
  for (const { a, b, key } of comparablePairs()) {
    if (!found.has(a.key) || !found.has(b.key)) continue;
    if (found.get(a.key) !== found.get(b.key)) continue;
    out.push({
      key,
      a,
      b,
      question: a.question,
      value: found.get(a.key),
      valueLabel: a.question === 'element'
        ? ELEMENT_NAMES[found.get(a.key)]
        : (found.get(a.key) === 'out' ? '外向き' : '内向き'),
      frequency: Object.prototype.hasOwnProperty.call(rates, key) ? rates[key] : null,
      structural: STRUCTURAL[key] || null,
    });
  }
  // Rarest first: an agreement that happens for a tenth of people is worth
  // more of the reader's attention than one that happens for half.
  return out.sort((x, y) => (x.frequency ?? 1) - (y.frequency ?? 1));
}

/**
 * How many of the comparable pairs agreed, out of how many could be checked.
 *
 * The denominator matters. "Three systems agree" means something different when
 * three pairs were checked than when twelve were.
 */
export function agreementTally(facts) {
  const found = answers(facts);
  let checked = 0;
  let agreed = 0;
  for (const { a, b } of comparablePairs()) {
    if (!found.has(a.key) || !found.has(b.key)) continue;
    checked += 1;
    if (found.get(a.key) === found.get(b.key)) agreed += 1;
  }
  return { checked, agreed };
}

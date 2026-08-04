/**
 * 吉方位 — the directions, from the 九星気学 year chart.
 *
 * Included because it is the one thing in this whole app a reader can *act on
 * today*. Everything else describes; a direction is a thing you can walk in.
 * That is a delivery format, not a new divination: the star it reads from
 * (`kyusei.js`) was already being computed.
 *
 * ## The year chart is arithmetic
 *
 * The nine stars sit in the Luoshu magic square, and the whole chart rotates
 * once a year. Every palace is:
 *
 *     star(direction) = ((base(direction) - 1 + (centre - 5)) mod 9) + 1
 *
 * with `centre` the year's own 本命星. That is the entire calculation, and it
 * falls out of the square rather than being copied from an almanac.
 *
 * **It is confirmed by a published value.** 2026 has 一白 at the centre, so the
 * formula puts 五黄 in the south and therefore 暗剣殺 — its opposition — in the
 * north. Multiple independent 九星気学 sources publish exactly that for 2026.
 * A transcription error or an off-by-one in the rotation could not land on it
 * by luck, and `tools/verify.mjs` asserts it.
 *
 * ## The school choice, stated
 *
 * Which directions count as 凶 varies by school. The set used here is the
 * common one, and it is listed rather than folded silently into the result:
 *
 *   everybody's:  五黄殺（五黄のいる方位）／暗剣殺（その対冲）／歳破（年支の対冲）
 *   yours:        本命殺（自分の本命星のいる方位）／本命的殺（その対冲）
 *
 * 吉 is then whatever is left whose star stands in a 相生 relation to yours —
 * 生気（相手が自分を生む）、退気（自分が相手を生む）、比和（同じ）. 五黄 is never
 * 吉 for anyone regardless of relation, which is the one exception every school
 * agrees on.
 *
 * Months have their own chart too, and a serious 気学 practitioner uses both.
 * Only the year chart is computed here, and the reading says so rather than
 * implying the answer is finer than it is.
 */

import { STARS, honmei } from './kyusei.js';

/**
 * The eight directions, in the Luoshu arrangement.
 *
 * `base` is the star standing there when 五黄 is at the centre. Note the chart
 * is drawn with south at the top, which is the 気学 convention and the reason
 * the numbers look upside down next to a modern map.
 */
export const DIRECTIONS = [
  { key: 'n', name: '北', base: 1, opposite: 's' },
  { key: 'ne', name: '北東', base: 8, opposite: 'sw' },
  { key: 'e', name: '東', base: 3, opposite: 'w' },
  { key: 'se', name: '南東', base: 4, opposite: 'nw' },
  { key: 's', name: '南', base: 9, opposite: 'n' },
  { key: 'sw', name: '南西', base: 2, opposite: 'ne' },
  { key: 'w', name: '西', base: 7, opposite: 'e' },
  { key: 'nw', name: '北西', base: 6, opposite: 'se' },
];

/** The direction a year branch faces, for 歳破 (its opposition). */
const BRANCH_DIRECTION = ['n', 'ne', 'ne', 'e', 'se', 'se', 's', 'sw', 'sw', 'w', 'nw', 'nw'];

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };

/** Star standing in a direction, for a year whose centre star is `centre`. */
export function starAt(centre, base) {
  return ((base - 1 + (centre - 5)) % 9 + 9) % 9 + 1;
}

/** The whole year chart: every direction, and what stands there. */
export function yearChart(solarYear) {
  const centre = honmei(solarYear);
  return {
    centre,
    centreStar: STARS[centre],
    palaces: DIRECTIONS.map((d) => ({ ...d, star: STARS[starAt(centre, d.base)] })),
  };
}

/**
 * The directions for one person in one year.
 *
 * `solarYear` is the 立春-reckoned year being asked about (usually now, not the
 * birth year); `birthStar` is the reader's 本命星. `yearBranch` gives 歳破.
 *
 * Every direction comes back labelled with *why* — a bare list of lucky
 * directions is unfalsifiable, and the reason is the part a reader can take to
 * another book and check.
 */
export function compass(solarYear, birthStar, yearBranch = null) {
  const chart = yearChart(solarYear);
  const mine = STARS[birthStar];

  const fiveYellow = chart.palaces.find((p) => p.star.number === 5);
  const mineAt = chart.palaces.find((p) => p.star.number === birthStar);
  // 歳破 is the opposition of the direction the year's branch faces.
  const facing = yearBranch == null ? null
    : DIRECTIONS.find((d) => d.key === BRANCH_DIRECTION[yearBranch]);
  const clash = facing ? DIRECTIONS.find((d) => d.key === facing.opposite) : null;

  const palaces = chart.palaces.map((palace) => {
    const bad = [];
    if (fiveYellow && palace.key === fiveYellow.key) bad.push('五黄殺');
    if (fiveYellow && palace.key === fiveYellow.opposite) bad.push('暗剣殺');
    if (clash && palace.key === clash.key) bad.push('歳破');
    if (mineAt && palace.key === mineAt.key) bad.push('本命殺');
    if (mineAt && palace.key === mineAt.opposite) bad.push('本命的殺');

    // 五黄 is never anybody's good direction, whatever the element says.
    const relation = palace.star.number === 5 ? null : relationOf(mine.element, palace.star.element);
    const good = bad.length === 0 && relation !== null;

    return {
      ...palace,
      bad,
      relation,
      good,
      // Ranked so the reading can show the strongest first without re-deriving
      // the ordering somewhere else and disagreeing with itself.
      rank: good ? { 生気: 0, 比和: 1, 退気: 2 }[relation] : 9,
    };
  });

  return {
    solarYear,
    centre: chart.centreStar,
    mine,
    palaces,
    good: palaces.filter((p) => p.good).sort((a, b) => a.rank - b.rank),
    bad: palaces.filter((p) => p.bad.length > 0),
    // Said out loud rather than implied: this is the year chart only.
    scope: '年盤だけで見ています。月盤を重ねると変わる月があります。',
  };
}

/**
 * 相生 relation, or null when the two elements overcome each other.
 *
 * Named from the reader's side: 生気 is "that star feeds mine".
 */
function relationOf(mine, theirs) {
  if (mine === theirs) return '比和';
  if (GENERATES[theirs] === mine) return '生気';
  if (GENERATES[mine] === theirs) return '退気';
  return null;
}

export const RELATION_PLAIN = {
  生気: 'いちばん強く効く方位です。行くと足りないものが入ってきます',
  比和: '同じ性質の方位です。無理がなく、続けて通うのに向きます',
  退気: '自分から出ていく方位です。整えたいときに効きます',
};

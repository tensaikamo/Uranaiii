/**
 * 九星気学 — 本命星 and 月命星.
 *
 * This system adds no astronomy. It needs exactly two things the chart engine
 * has already computed to the second: the year as reckoned from 立春, and the
 * month as reckoned from the 節入り. That is the whole reason it is worth
 * including — **most 九星 tools get the boundary cases wrong**, because they
 * take the year from the calendar (so everybody born in January and early
 * February is assigned the wrong star) or the month from the civil month (so
 * everybody born in the first days of a month may be). Here both boundaries
 * come from `swe_solcross_ut`, and a birth close to one is reported as close to
 * one, with the ingress time shown.
 *
 * ## The tables are not tables
 *
 * Copied tables are how this system is normally implemented, and a copied table
 * can only ever be checked against the copy. Both rules here are stated as the
 * arithmetic they actually are, and `tools/verify.mjs` checks the *properties*
 * — that the year star descends by exactly one every year, that the month star
 * descends by exactly one every 節-month including across the year boundary,
 * and that the three-group month table reproduces itself from that descent.
 * A mistyped entry cannot satisfy those by luck.
 */

/**
 * The nine stars, in their own order.
 *
 * The 五行 column is not decoration: it is the seam through which this system
 * can be compared with the 命式 at all. 本命星 が 水 and a chart whose 用神 is
 * 水 are saying the same thing in two vocabularies, and the agreement layer
 * needs them in one vocabulary to notice.
 */
export const STARS = [
  null, // 1-based: the system names them 一…九 and reads better indexed that way.
  { number: 1, name: '一白水星', element: 'water', plain: '水の星。流れる、しみこむ、低いところへ行く' },
  { number: 2, name: '二黒土星', element: 'earth', plain: '土の星。受けとめる、育てる、面倒を見る' },
  { number: 3, name: '三碧木星', element: 'wood', plain: '木の星。音を立てる、勢いよく伸びる、若い' },
  { number: 4, name: '四緑木星', element: 'wood', plain: '木の星。風のように行き渡る、まとまりをつくる' },
  { number: 5, name: '五黄土星', element: 'earth', plain: '土の星。中心に居る、動かない、良くも悪くも強い' },
  { number: 6, name: '六白金星', element: 'metal', plain: '金の星。筋を通す、仕切る、休まない' },
  { number: 7, name: '七赤金星', element: 'metal', plain: '金の星。人が集まる、喋る、楽しむ' },
  { number: 8, name: '八白土星', element: 'earth', plain: '土の星。積み上げる、止まる、変わり目に立つ' },
  { number: 9, name: '九紫火星', element: 'fire', plain: '火の星。明るく照らす、見抜く、離れる' },
];

/** Map an unbounded integer onto 1…9. */
function toStar(n) {
  return ((n - 1) % 9 + 9) % 9 + 1;
}

/**
 * 本命星 — the year star, from the 立春-reckoned year.
 *
 * The rule is that the star descends by one each year, so it is a single
 * subtraction rather than a ninety-year table. The phase is pinned by a year
 * anybody can check: **2022 は五黄土星**, the 五黄 year people talk about. From
 * that one anchor every other year follows, and the anchor is asserted in
 * verify.mjs so a change to this line has to break a named year.
 */
export function honmei(solarYear) {
  return toStar(11 - (((solarYear % 9) + 9) % 9));
}

/**
 * Which of the three phases a year star belongs to: 一四七 / 二五八 / 三六九.
 *
 * The usual presentation is a 3×12 table of month stars. It is not really a
 * table — it is the same descent as the year star, continued month by month,
 * and the three groups are just where that descent happens to be standing when
 * a given year opens. Twelve 節-months descend by twelve, and 12 mod 9 = 3, so
 * consecutive years land three apart; that is exactly the spacing of the three
 * groups. Writing it as a table hides that, and hides the fact that it is
 * checkable.
 */
export function starGroup(yearStar) {
  return ((yearStar - 1) % 3 + 3) % 3; // 0: 一四七, 1: 二五八, 2: 三六九
}

/** 寅月's month star for each of the three groups — the phase of the descent. */
const MONTH_ANCHOR = [8, 2, 5];

/**
 * 月命星 — the month star, from the 節-reckoned month branch.
 *
 * `monthBranch` is the branch index the 月柱 already carries (寅 = 2), so this
 * is keyed to the actual 節入り and not to the civil month.
 */
export function getsumei(solarYear, monthBranch) {
  const anchor = MONTH_ANCHOR[starGroup(honmei(solarYear))];
  // Months run 寅, 卯, 辰 … so the offset is measured from 寅.
  const monthsSinceTiger = ((monthBranch - 2) % 12 + 12) % 12;
  return toStar(anchor - monthsSinceTiger);
}

/**
 * Both stars for a chart, plus how close the birth sits to the two boundaries
 * that decide them.
 *
 * The distances are the point. A birth on 2 February is three days from 立春,
 * and three days is inside the range where a badly-implemented tool will
 * disagree with this one — so the reading says so rather than presenting a
 * clean answer that happens to be contested.
 */
export function kyusei(chart) {
  const { pillars, time } = chart;
  const solarYear = pillars.solarYear;
  // `branch` on a pillar is already the index (子 = 0), not the character —
  // 子 is 0, so this has to test for absence, not for falsiness.
  const monthBranch = pillars.month ? pillars.month.branch : null;
  if (monthBranch == null) return null;

  const year = STARS[honmei(solarYear)];
  const month = STARS[getsumei(solarYear, monthBranch)];

  return {
    solarYear,
    year,
    month,
    // Days from the birth to each governing ingress. Negative is "already past".
    daysSinceRisshun: time.ut - pillars.risshun,
    daysSinceSetsu: time.ut - pillars.period.start,
    daysUntilNextSetsu: pillars.period.end - time.ut,
    setsu: pillars.period.term.name,
  };
}

/**
 * 数秘術 — the life path number.
 *
 * ## This one is thin, and saying so is the point
 *
 * Everything else in this app is anchored to something outside human
 * convention: a solar longitude, a lunar position, an angle above the horizon.
 * This is anchored to **the way we happen to write the date down**. Nothing in
 * the sky changes at midnight; the digits do.
 *
 * Concretely, and these are not quibbles:
 *
 *   - It uses the Gregorian calendar, which was adopted in Japan in 1873. The
 *     same birth written in the old calendar reduces to a different number.
 *   - It uses base ten. Digit sums are a property of the notation.
 *   - It ignores the time and the place entirely, so identical twins and
 *     everyone else born that day share it.
 *   - There are nine outcomes (twelve with the master numbers). **Each one is
 *     true of about one person in nine** — an order of magnitude more people
 *     than a 宿 (one in 27) and three orders more than a 命式.
 *
 * That last number is the honest way to read it, and it is why this is
 * included at the smallest possible weight rather than left out: a reader who
 * has met numerology elsewhere should be able to see where it sits *relative*
 * to the rest, and one line in nine is exactly the scale of "sounds specific,
 * is not". The frequency chip beside it says so without any editorialising.
 *
 * It is here for one more reason: the agreement layer needs at least one thin
 * system to calibrate against. If two thick systems agree no more often than
 * this one does with them, that is worth knowing.
 */

/** Reduce to a single digit, stopping at the master numbers. */
function reduce(n) {
  let value = n;
  while (value > 9 && value !== 11 && value !== 22 && value !== 33) {
    value = String(value).split('').reduce((sum, d) => sum + Number(d), 0);
  }
  return value;
}

/**
 * The numbers and what the tradition attaches to them.
 *
 * Master numbers are kept unreduced, which is the majority convention, and
 * flagged — schools disagree about whether they exist at all, and a reader
 * whose other tool reduced 11 to 2 should be able to see why the two differ.
 */
export const NUMBERS = {
  1: { plain: '先頭に立つ。決めるのが早い', master: false },
  2: { plain: '間に立つ。合わせる、受けとめる', master: false },
  3: { plain: '表に出す。喋る、作る、楽しませる', master: false },
  4: { plain: '積む。手順を守る、崩さない', master: false },
  5: { plain: '動く。飽きる、場所を変える', master: false },
  6: { plain: '面倒を見る。抱えこむ', master: false },
  7: { plain: '一人で調べる。納得するまで動かない', master: false },
  8: { plain: '回す。人と金を動かす', master: false },
  9: { plain: '手放す。最後まで面倒を見て、去る', master: false },
  11: { plain: '感じ取りすぎる。振れ幅が大きい', master: true },
  22: { plain: '大きく作る。時間がかかる', master: true },
  33: { plain: '配る。自分の分を残さない', master: true },
};

/**
 * Life path from the civil birth date.
 *
 * Summed digit by digit across the whole written date, which is the common
 * convention; summing the three reduced parts instead gives a different answer
 * for some dates, so the method is named rather than assumed.
 */
export function lifePath({ year, month, day }) {
  const digits = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const total = digits.split('').reduce((sum, d) => sum + Number(d), 0);
  const number = reduce(total);
  return {
    number,
    total,
    digits,
    method: '書いた日付の数字を全部足して1桁まで畳む（11・22・33は畳まない）',
    ...NUMBERS[number],
  };
}

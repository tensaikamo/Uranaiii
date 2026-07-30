/**
 * 宿曜 — the 27 mansions, from where the Moon actually was.
 *
 * ## The thing this does that the others do not
 *
 * The Moon crosses a mansion boundary every 22 hours or so. A birth recorded
 * only to the day is therefore genuinely spread across **one to two whole
 * mansions**, and a birth recorded to ±30 minutes lands within a few minutes of
 * a boundary about one time in fifty. Almost every 宿曜 tool answers with a
 * single mansion regardless, because almost every one works from a table keyed
 * to the 旧暦 date, which cannot express "this record does not determine it".
 *
 * This one computes the Moon's sidereal longitude and finds the boundary times,
 * so when a record does not determine the mansion it says so, and says which
 * two, and in what proportion. `uncertainty.js` already does exactly this for
 * the 節入り; this is the same idea applied to a body that moves fourteen times
 * faster, where it matters fourteen times as often.
 *
 * ## The school divergence, stated rather than hidden
 *
 * There are two live ways to assign a mansion:
 *
 *   - **the Moon's position** — sidereal longitude divided into 27 equal parts.
 *     What this file does.
 *   - **the 旧暦 date** — a table from the lunar month and day. This is what
 *     Japanese 宿曜 has mostly been done from, and it is not the same answer:
 *     the table is an equal-division scheme laid over a month whose real length
 *     varies, so the two disagree for a substantial share of births.
 *
 * Neither is "the correct one" — they are different traditions. The position
 * method is chosen here because it is the one that can be *checked*, and
 * because it is the one that can carry an error bar. The reading says which
 * method it used, in the same way the chart says 定気法 rather than assuming it.
 */

import { MANSION_SPAN, mansionIndex, mansionWindow, moonSidereal } from './lunar.js';

/**
 * The 27 mansions in the order the divisions run, starting from 婁 (Ashvinī) at
 * sidereal 0°.
 *
 * The order is the nakshatra order, not the Chinese 28-宿 order — they are the
 * same names in a different starting place, and the 27-fold scheme is the one
 * with equal divisions, so 0° has to be where the 27-fold scheme puts it. The
 * glosses are the classical attributions, kept short and kept concrete; they
 * are traits, not compliments, which is the point.
 */
export const MANSIONS = [
  { name: '婁宿', kana: 'ろうしゅく', plain: '素早く動き、先に行く。手当てがうまい' },
  { name: '胃宿', kana: 'いしゅく', plain: '抱えこんで耐える。譲らない' },
  { name: '昴宿', kana: 'ぼうしゅく', plain: '切って、燃やして、はっきりさせる' },
  { name: '畢宿', kana: 'ひっしゅく', plain: '育てて留める。実るまで待てる' },
  { name: '觜宿', kana: 'ししゅく', plain: '探して動き回る。自分で確かめないと済まない' },
  { name: '参宿', kana: 'しんしゅく', plain: '一度壊してから作り直す' },
  { name: '井宿', kana: 'せいしゅく', plain: '戻ってくる。繰り返して立て直す' },
  { name: '鬼宿', kana: 'きしゅく', plain: '養い、守る。根を張る' },
  { name: '柳宿', kana: 'りゅうしゅく', plain: '絡んで離さない。よく見抜く' },
  { name: '星宿', kana: 'せいしゅく', plain: '継ぐ。名を負う。格式を重んじる' },
  { name: '張宿', kana: 'ちょうしゅく', plain: '楽しみ、人と結ぶ。休むのが下手ではない' },
  { name: '翼宿', kana: 'よくしゅく', plain: '助ける。約束を続ける' },
  { name: '軫宿', kana: 'しんしゅく', plain: '手でつくる。器用に掴む' },
  { name: '角宿', kana: 'かくしゅく', plain: '飾り、目立たせ、形にする' },
  { name: '亢宿', kana: 'こうしゅく', plain: '独りで動く。縛られたくない' },
  { name: '氐宿', kana: 'ていしゅく', plain: '狙いを定める。二つを天秤にかける' },
  { name: '房宿', kana: 'ぼうしゅく', plain: '交わり、まとめる。友を得る' },
  { name: '心宿', kana: 'しんしゅく', plain: '先頭に立つ。譲らず、庇う' },
  { name: '尾宿', kana: 'びしゅく', plain: '根を掘る。壊して底を見る' },
  { name: '箕宿', kana: 'きしゅく', plain: '押し通す。飽きない、負けない' },
  { name: '斗宿', kana: 'としゅく', plain: '勝ちきる。最後まで立っている' },
  { name: '女宿', kana: 'じょしゅく', plain: '聞いて、学んで、伝える' },
  { name: '虚宿', kana: 'きょしゅく', plain: '響かせる。拍を刻んで人を集める' },
  { name: '危宿', kana: 'きしゅく', plain: '覆い、隠し、癒す' },
  { name: '室宿', kana: 'しつしゅく', plain: '火を持つ。極端で、思い切る' },
  { name: '壁宿', kana: 'へきしゅく', plain: '深く沈む。静かで、底が知れない' },
  { name: '奎宿', kana: 'けいしゅく', plain: '渡し、送り届ける。終わりの世話をする' },
];

/**
 * Every mansion the window [from, to] touches, with the share of the window
 * each one occupies.
 *
 * Walks boundary to boundary rather than sampling: the Moon's sidereal
 * longitude only increases, so the mansions in a window are consecutive and the
 * walk terminates. A 24-hour window can reach three of them (a boundary
 * crossed just after the start and another just before the end), so the guard
 * is set above that rather than at two.
 */
function mansionsAcross(from, to) {
  const out = [];
  let cursor = from;
  for (let guard = 0; guard < 6 && cursor < to; guard += 1) {
    const window = mansionWindow(cursor);
    const start = Math.max(window.start, from);
    const end = Math.min(window.end, to);
    out.push({ index: window.index, from: start, to: end, fraction: (end - start) / (to - from) });
    // Step just past the boundary; the epsilon is a second, far below the
    // precision of any birth record and far above the bisection's resolution.
    cursor = window.end + 1 / 86400;
  }
  return out;
}

/**
 * The mansion for a birth, with its error bar.
 *
 * `minutes` is the recorded precision (`precisionMinutes()` from
 * uncertainty.js); `null` means no time was recorded, and then the window is
 * the whole day — which for the Moon is most of a mansion, so a timeless record
 * usually genuinely straddles two. That is not a defect of the record, it is
 * what the record says, and it gets reported rather than resolved by fiat.
 *
 * `state` mirrors uncertainty.js: `determinate` when one mansion holds the
 * whole window, `boundary` when more than one does, `unknown` when no time was
 * recorded *and* that leaves it split.
 */
export function shukuyo(jdUt, minutes) {
  const half = (minutes === null ? 12 * 60 : minutes) / 1440;
  const spread = mansionsAcross(jdUt - half, jdUt + half)
    .map((m) => ({ ...m, mansion: MANSIONS[m.index] }))
    .sort((a, b) => b.fraction - a.fraction);

  const index = mansionIndex(jdUt);
  const window = mansionWindow(jdUt);

  return {
    index,
    mansion: MANSIONS[index],
    // Where in its own mansion the Moon stands, 0 to 1. A birth at 0.02 is a
    // birth that a tool rounding differently will place in the previous one.
    position: (moonSidereal(jdUt) % MANSION_SPAN) / MANSION_SPAN,
    enters: window.start,
    leaves: window.end,
    spread,
    state: spread.length === 1 ? 'determinate' : (minutes === null ? 'unknown' : 'boundary'),
    minutes,
  };
}

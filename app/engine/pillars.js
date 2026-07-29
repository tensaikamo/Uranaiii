/**
 * The four pillars (spec §3.3, §3.4, §3.5).
 */

import { calendarDate } from './swe.js';
import { termPeriod, governingRisshun } from './terms.js';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 五行 of each stem, and of each branch, for the marks beside the pillars. */
export const STEM_ELEMENT = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water'];
export const BRANCH_ELEMENT = [
  'water', 'earth', 'wood', 'wood', 'earth', 'fire',
  'fire', 'earth', 'metal', 'metal', 'earth', 'water',
];
export const STEM_YIN_YANG = ['陽', '陰', '陽', '陰', '陽', '陰', '陽', '陰', '陽', '陰'];

/**
 * Day pillar epoch offset: index = (JDN + 49) mod 60.
 *
 * Not written from memory. Derived from seven dates spread over 1901-2026 and
 * confirmed against two independent almanacs; all seven imply the same 49.
 * See VERIFY.md for the sources and the dates.
 */
export const DAY_PILLAR_OFFSET = 49;

/**
 * 五虎遁 — the stem of the 寅 month, indexed by year stem.
 * An explicit table, per spec §3.4: not reconstructed from arithmetic.
 *   甲/己 -> 丙寅   乙/庚 -> 戊寅   丙/辛 -> 庚寅   丁/壬 -> 壬寅   戊/癸 -> 甲寅
 */
export const TIGER_MONTH_STEM = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];

/**
 * 五鼠遁 — the stem of the 子 hour, indexed by day stem.
 *   甲/己 -> 甲子   乙/庚 -> 丙子   丙/辛 -> 戊子   丁/壬 -> 庚子   戊/癸 -> 壬子
 */
export const RAT_HOUR_STEM = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];

const mod = (n, m) => ((n % m) + m) % m;

export function pillar(stemIndex, branchIndex) {
  const stem = mod(stemIndex, 10);
  const branch = mod(branchIndex, 12);
  return {
    stem,
    branch,
    stemChar: STEMS[stem],
    branchChar: BRANCHES[branch],
    text: STEMS[stem] + BRANCHES[branch],
    stemElement: STEM_ELEMENT[stem],
    branchElement: BRANCH_ELEMENT[branch],
    yinYang: STEM_YIN_YANG[stem],
  };
}

/** Sexagenary pillar from a cycle index 0-59 (甲子 = 0). */
export function pillarFromIndex(index) {
  const n = mod(index, 60);
  return pillar(n % 10, n % 12);
}

/** Julian Day Number of the civil day containing a local-clock Julian Day. */
export function dayNumber(localJd) {
  return Math.floor(localJd + 0.5);
}

/** Hour of the local clock, 0-23.999, from a local-clock Julian Day. */
export function clockHour(localJd) {
  const date = calendarDate(localJd);
  return date.hour;
}

/**
 * 時辰 index from the local hour. 子 spans 23:00-00:59, so the hour is shifted
 * by one before halving: 23 and 0 both land on 子, 1 and 2 on 丑, and so on.
 */
export function hourBranch(hour) {
  return Math.floor(mod(hour + 1, 24) / 2);
}

/**
 * Assemble the four pillars.
 *
 * `ut` drives the year and month; `local` drives the day and hour. That split
 * is the whole point of spec §2.1 and is enforced by the signature: the two
 * clocks arrive as separate arguments and are never reconciled.
 */
export function computePillars({ ut, local, termMethod = 'teiki', ziShi = 'late', hourKnown = true }) {
  const period = termPeriod(ut, termMethod);
  const risshun = governingRisshun(ut, termMethod);
  const solarYear = calendarDate(risshun).year;

  const yearIndex = mod(solarYear - 4, 60);
  const year = pillarFromIndex(yearIndex);

  const monthStem = TIGER_MONTH_STEM[year.stem] + mod(period.branch - 2, 12);
  const month = pillar(monthStem, period.branch);

  const hour = hourKnown ? clockHour(local) : null;

  // 早子時 moves the 23:00 hour onto the next day. Because the hour stem is
  // derived from the day stem, the hour pillar has to follow it (spec §3.5);
  // advancing the day alone is the classic bug here.
  let jdn = dayNumber(local);
  const inLateZi = hourKnown && hour >= 23;
  if (ziShi === 'early' && inLateZi) jdn += 1;

  const day = pillarFromIndex(jdn + DAY_PILLAR_OFFSET);

  let hourPillar = null;
  if (hourKnown) {
    const branch = hourBranch(hour);
    hourPillar = pillar(RAT_HOUR_STEM[day.stem] + branch, branch);
  }

  return {
    year,
    month,
    day,
    hour: hourPillar,
    solarYear,
    risshun,
    period,
    localHour: hour,
    zishiApplied: ziShi === 'early' && inLateZi,
  };
}

export const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'];
export const ELEMENT_NAMES = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

/**
 * The 五行 tally of a chart.
 *
 * Every count carries the characters it came from. That is the §8.2 rule
 * applied to a number rather than a sentence: a bare "water is strong" would
 * be unsourced, and this cannot be rendered without its sources.
 */
export function elementBalance(pillars) {
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  const sources = Object.fromEntries(ELEMENTS.map((e) => [e, []]));

  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = pillars[key];
    if (!p) continue;
    counts[p.stemElement] += 1;
    sources[p.stemElement].push(`${label}干:${p.stemChar}`);
    counts[p.branchElement] += 1;
    sources[p.branchElement].push(`${label}支:${p.branchChar}`);
  }

  const total = ELEMENTS.reduce((sum, e) => sum + counts[e], 0);
  return { counts, sources, total };
}

/** Stable identity of a chart, for the axis-difference logic of spec §4.2. */
export function pillarSignature(pillars) {
  return [pillars.year, pillars.month, pillars.day, pillars.hour]
    .map((p) => (p ? p.text : '—'))
    .join('|');
}

/**
 * Phase 0 verification gate (spec §1) plus the standing checks from §2.3,
 * §3.3 and §3.4. Run with:  node tools/verify.mjs
 *
 * Writes VERIFY.md. Exits non-zero if any check fails, so the gate cannot be
 * passed by accident.
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import SwissEph from '../vendor/swisseph-wasm/src/swisseph.js';
import { initEphemeris, ephemerisVersion, sunLongitude, equationOfTime, sunCrossing, julianDay, calendarDate, deltaTSeconds, withinEphemeris, EPHEMERIS_YEARS } from '../app/engine/swe.js';
import { buildChart, buildChartAtOffset, DEFAULT_AXES } from '../app/engine/chart.js';
import { resolveUncertainty } from '../app/engine/uncertainty.js';
import { readChart, readingSignature, summarise } from '../app/engine/reading.js';
import { voiceStatements } from '../app/engine/voice.js';
import { strokesOf } from '../app/engine/strokes.js';
import { fiveGrids, elementOfCount } from '../app/engine/name.js';
import { luckDirection, luckPeriods, luckOnset, ageNow, ageExact, cycleAtAge } from '../app/engine/luck.js';
import { hiddenStems, hiddenTable, TRIADS, NO_MIDDLE } from '../app/engine/hidden.js';
import { timeline } from '../app/engine/timeline.js';
import { judgeStrength, judgeBoth } from '../app/engine/strength.js';
import { gauges, dayStemInDoubt, SCORE_SCALE } from '../app/engine/gauges.js';
import { domainBullets, summaryCards, domainStatements, DOMAINS, MAX_PER_DOMAIN, ROOTED_AT } from '../app/engine/domains.js';
import { frequencyOf } from '../app/engine/rarity.js';
import { trueTermPeriod, meanTermPeriod, degreesSinceRisshun, termPeriod, termIngresses, SETSU } from '../app/engine/terms.js';
import { computePillars, TIGER_MONTH_STEM, RAT_HOUR_STEM, DAY_PILLAR_OFFSET, pillarFromIndex, STEMS, BRANCHES, STEM_ELEMENT } from '../app/engine/pillars.js';
import { japanOffsetHours, japanNow } from '../app/engine/time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failures = 0;

function record(section, name, passed, detail) {
  results.push({ section, name, passed, detail });
  if (!passed) failures += 1;
}

// Rounded on the Julian Day, so a time rounding up through midnight moves the
// date with it rather than producing 24:00 on the day before.
const jstString = (jd) => {
  const r = calendarDate(Math.round((jd + 9 / 24) * 1440) / 1440);
  const total = Math.round(r.hour * 60);
  return `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')} `
    + `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

await initEphemeris();

// --- §1-3  known values -----------------------------------------------------

record('ephemeris', 'Swiss Ephemeris version', true, ephemerisVersion());

// The .se1 files must actually be read. If SWIEPH silently fell back to the
// built-in Moshier ephemeris the two would agree bit for bit.
{
  const raw = new SwissEph();
  await raw.initSwissEph();
  const swieph = raw.calc_ut(2451545.0, 0, 2)[0];
  const moshier = raw.calc_ut(2451545.0, 0, 4)[0];
  const arcsec = Math.abs(swieph - moshier) * 3600;
  record('ephemeris', 'SWIEPH reads bundled .se1 (not a silent Moshier fallback)',
    arcsec > 1e-6 && arcsec < 1,
    `SWIEPH−Moshier = ${arcsec.toFixed(4)}″ (non-zero, sub-arcsecond)`);

  // Meeus, Astronomical Algorithms 2nd ed., Example 25.b:
  // 1992 October 13.0 TD -> apparent longitude 199°54'21.56"
  const meeus = raw.calc(2448908.5, 0, 2).longitude;
  const published = 199 + 54 / 60 + 21.56 / 3600;
  const diff = Math.abs(meeus - published) * 3600;
  record('known values', 'Sun apparent longitude vs Meeus Example 25.b',
    diff < 1,
    `computed ${meeus.toFixed(7)}° vs published ${published.toFixed(7)}° — Δ ${diff.toFixed(3)}″`);
}

{
  const lon = sunLongitude(2451545.0);
  record('known values', 'Sun apparent longitude 2000-01-01 12:00 UT',
    lon > 280 && lon < 281,
    `${lon.toFixed(9)}°`);
  const dt = deltaTSeconds(2451545.0);
  record('known values', 'ΔT at J2000 (published ≈ 63.83 s)',
    Math.abs(dt - 63.83) < 0.5, `${dt.toFixed(3)} s`);
}

// --- §1-3  equation of time sign -------------------------------------------
// Getting this backwards costs at most 32 minutes, which is small enough to go
// unnoticed and large enough to move an hour branch. Both extremes are checked.
{
  const feb = equationOfTime(julianDay(2024, 2, 11, 12)) * 1440;
  const nov = equationOfTime(julianDay(2024, 11, 3, 12)) * 1440;
  record('equation of time', 'mid-February ≈ −14 min (apparent behind mean)',
    feb < -13 && feb > -15, `${feb.toFixed(2)} min`);
  record('equation of time', 'early November ≈ +16 min (apparent ahead of mean)',
    nov > 15 && nov < 17, `${nov.toFixed(2)} min`);
  record('equation of time', 'sign convention: swe_time_equ = apparent − mean, added to build LAT',
    feb < 0 && nov > 0, 'confirmed by the two extremes above');
}

// --- §3.1  solar terms against the national ephemeris ----------------------
// Reference values: 国立天文台 暦計算室 (NAOJ), 暦要項 / 二十四節気・雑節, JST,
// published to the minute.
const NAOJ = {
  2011: [['小寒', '2011-01-06 01:55'], ['立春', '2011-02-04 13:33'], ['啓蟄', '2011-03-06 07:30'],
    ['清明', '2011-04-05 12:12'], ['立夏', '2011-05-06 05:23'], ['芒種', '2011-06-06 09:27'],
    ['小暑', '2011-07-07 19:42'], ['立秋', '2011-08-08 05:33'], ['白露', '2011-09-08 08:34'],
    ['寒露', '2011-10-09 00:19'], ['立冬', '2011-11-08 03:35'], ['大雪', '2011-12-07 20:29']],
  2025: [['小寒', '2025-01-05 11:33'], ['立春', '2025-02-03 23:10'], ['啓蟄', '2025-03-05 17:07'],
    ['清明', '2025-04-04 21:49'], ['立夏', '2025-05-05 14:57'], ['芒種', '2025-06-05 18:57'],
    ['小暑', '2025-07-07 05:05'], ['立秋', '2025-08-07 14:52'], ['白露', '2025-09-07 17:52'],
    ['寒露', '2025-10-08 09:41'], ['立冬', '2025-11-07 13:04'], ['大雪', '2025-12-07 06:05']],
};

for (const [year, rows] of Object.entries(NAOJ)) {
  let matched = 0;
  const misses = [];
  for (const [name, expected] of rows) {
    const term = SETSU.find((t) => t.name === name);
    const [datePart] = expected.split(' ');
    const [y, m] = datePart.split('-').map(Number);
    // Anchor the search to the month in question, never to a calendar year:
    // solcross returns the next crossing, so a loose anchor finds the wrong one.
    const jd = sunCrossing(term.longitude, julianDay(y, m, 1, 0) - 5);
    const got = jstString(jd);
    if (got === expected) matched += 1; else misses.push(`${name}: got ${got}, NAOJ ${expected}`);
  }
  record('solar terms', `${year}: 12 節 vs NAOJ published times`,
    matched === rows.length,
    matched === rows.length ? `${matched}/12 exact to the published minute` : misses.join('; '));
}

// --- §3.1  the 0°/360° wrap -------------------------------------------------
{
  const order = SETSU.map((t) => degreesSinceRisshun(t.longitude));
  const monotonic = order.every((v, i) => i === 0 || v > order[i - 1]);
  record('solar terms', 'longitudes unwrap to a monotonic sequence from 立春',
    monotonic && order[0] === 0 && order[11] === 330,
    `315→345→15→…→285 becomes ${order.join(', ')}`);

  // A date in early April sits after 清明 (15°). Naive numeric comparison would
  // place 15° below 立春's 315° and select the wrong month branch.
  const april = trueTermPeriod(julianDay(2024, 4, 20, 3));
  record('solar terms', 'April date resolves to 辰 month across the 360° wrap',
    april.term.name === '清明' && april.branch === 4,
    `${april.term.name}, branch ${BRANCHES[april.branch]}`);
}

// --- §3.2  恒気法 -----------------------------------------------------------
{
  const jd = julianDay(2024, 4, 20, 3) - 9 / 24;
  const mean = meanTermPeriod(jd);
  const spanDays = (mean.end - mean.start);
  record('solar terms', '恒気法 divides the solstice year into equal steps',
    Math.abs(spanDays - 365.2422 / 12) < 0.05,
    `period length ${spanDays.toFixed(4)} d (tropical year / 12 = ${(365.2422 / 12).toFixed(4)} d)`);
}

// --- §2.3  UT discipline ----------------------------------------------------
// swe_calc and swe_solcross are ET-based; mixing them with the _ut forms puts
// tens of seconds to minutes of ΔT error into boundary decisions.
{
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!entry.endsWith('.js')) continue;
      const src = readFileSync(path, 'utf8');
      for (const [i, line] of src.split('\n').entries()) {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (/\bswe_calc\s*\(|\bswe_solcross\s*\(|\.calc\s*\(|\.solcross\s*\(/.test(code)) {
          offenders.push(`${path.replace(ROOT + '/', '')}:${i + 1}`);
        }
      }
    }
  };
  walk(join(ROOT, 'app'));
  record('time scale', 'app/ uses only _ut ephemeris entry points',
    offenders.length === 0,
    offenders.length === 0 ? 'no ET-based call sites in app/' : `ET calls at ${offenders.join(', ')}`);
}

// --- §2.4  Japanese daylight saving 1948-1951 ------------------------------
// Re-derived from the host's IANA tz database rather than trusted from memory.
{
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', timeZoneName: 'longOffset' });
  const offsetOf = (date) => fmt.formatToParts(date).find((p) => p.type === 'timeZoneName').value;
  const samples = [
    ['1948-07-01T03:00:00Z', 10], ['1948-11-01T03:00:00Z', 9],
    ['1949-06-01T03:00:00Z', 10], ['1950-06-01T03:00:00Z', 10],
    ['1951-06-01T03:00:00Z', 10], ['1952-06-01T03:00:00Z', 9],
    ['1947-06-01T03:00:00Z', 9],
  ];
  const wrong = [];
  for (const [iso, expected] of samples) {
    const date = new Date(iso);
    const iana = offsetOf(date) === 'GMT+10:00' ? 10 : 9;
    const parts = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})/).slice(1).map(Number);
    const wall = julianDay(parts[0], parts[1], parts[2], parts[3] + iana);
    const ours = japanOffsetHours(wall).offsetHours;
    if (iana !== expected || ours !== expected) wrong.push(`${iso}: IANA ${iana}, ours ${ours}, expected ${expected}`);
  }
  record('time zone', 'DST table 1948-1951 agrees with the IANA tz database',
    wrong.length === 0,
    wrong.length === 0 ? 'all 7 probes agree (UTC+10 in the 1948-51 summers, UTC+9 otherwise)' : wrong.join('; '));
}

// --- §3.3  day pillar -------------------------------------------------------
// The offset is not written from memory. Two independent almanacs, seven dates
// spread over 125 years:
//   A. 国立天文台 暦計算室「通日・曜日・干支」 (NAOJ)
//   B. ksuimei.com 万年暦（干支暦）
const DAY_PILLARS = [
  ['1901-01-01', '己卯'], ['1936-02-26', '戊寅'], ['1955-08-15', '戊申'], ['1984-02-02', '丙寅'],
  ['2000-01-01', '戊午'], ['2011-03-11', '乙丑'], ['2026-07-28', '癸卯'],
];
{
  const misses = [];
  for (const [date, expected] of DAY_PILLARS) {
    const [y, m, d] = date.split('-').map(Number);
    // Local apparent noon keeps the day number away from either boundary.
    const jdn = Math.floor(julianDay(y, m, d, 12) + 0.5);
    const got = pillarFromIndex(jdn + DAY_PILLAR_OFFSET).text;
    if (got !== expected) misses.push(`${date}: got ${got}, sources say ${expected}`);
  }
  record('day pillar', `offset ${DAY_PILLAR_OFFSET} vs two independent almanacs, 1901-2026`,
    misses.length === 0,
    misses.length === 0 ? `${DAY_PILLARS.length}/${DAY_PILLARS.length} dates agree with both NAOJ and ksuimei` : misses.join('; '));
}

// --- §3.4  五虎遁 / 五鼠遁 --------------------------------------------------
{
  // Month stems from the same independent almanac (ksuimei 干支暦 headers).
  const MONTHS = [
    { date: '1901-01-01', solarYear: 1900, branch: 0, expected: '戊子' },
    { date: '1955-08-15', solarYear: 1955, branch: 8, expected: '甲申' },
    { date: '2011-03-11', solarYear: 2011, branch: 3, expected: '辛卯' },
    { date: '2026-07-28', solarYear: 2026, branch: 7, expected: '乙未' },
  ];
  const misses = [];
  for (const { date, solarYear, branch, expected } of MONTHS) {
    const yearStem = ((solarYear - 4) % 60 + 60) % 60 % 10;
    const stem = (TIGER_MONTH_STEM[yearStem] + ((branch - 2) % 12 + 12) % 12) % 10;
    const got = STEMS[stem] + BRANCHES[branch];
    if (got !== expected) misses.push(`${date}: got ${got}, almanac ${expected}`);
  }
  record('遁法', '五虎遁 table vs almanac month pillars',
    misses.length === 0,
    misses.length === 0 ? `${MONTHS.length}/${MONTHS.length} month pillars agree` : misses.join('; '));

  // Structural check: the hour cycle must run unbroken across midnight, and the
  // month cycle unbroken across 立春. Both hold only if the tables are right.
  const hourContinuous = RAT_HOUR_STEM.every((v, i) => RAT_HOUR_STEM[(i + 1) % 10] === (v + 2) % 10);
  const monthContinuous = TIGER_MONTH_STEM.every((v, i) => TIGER_MONTH_STEM[(i + 1) % 10] === (v + 2) % 10);
  record('遁法', '五鼠遁 keeps the 60-cycle unbroken from 亥時 to the next 子時',
    hourContinuous, 'stem of 子時 advances by 2 for each step of the day stem');
  record('遁法', '五虎遁 keeps the 60-cycle unbroken from 丑月 to the next 寅月',
    monthContinuous, 'stem of 寅月 advances by 2 for each step of the year stem');
}

// --- §3.5  早子時 -----------------------------------------------------------
// Advancing the day without re-deriving the hour stem is the documented trap.
{
  const at = (hour, ziShi) => computePillars({
    ut: julianDay(2024, 5, 10, hour) - 9 / 24,
    local: julianDay(2024, 5, 10, hour),
    ziShi,
    hourKnown: true,
  });
  const late = at(23.5, 'late');
  const early = at(23.5, 'early');
  const dayMoved = late.day.text !== early.day.text;
  const hourFollowed = late.hour.text !== early.hour.text;
  const consistent = early.hour.stem === (RAT_HOUR_STEM[early.day.stem] + early.hour.branch) % 10;
  record('子時', '早子時 moves the day pillar and the hour stem follows it',
    dayMoved && hourFollowed && consistent,
    `晩子時 ${late.day.text}/${late.hour.text} → 早子時 ${early.day.text}/${early.hour.text}`);

  const noon = computePillars({
    ut: julianDay(2024, 5, 10, 12) - 9 / 24, local: julianDay(2024, 5, 10, 12), ziShi: 'early', hourKnown: true,
  });
  const noonLate = computePillars({
    ut: julianDay(2024, 5, 10, 12) - 9 / 24, local: julianDay(2024, 5, 10, 12), ziShi: 'late', hourKnown: true,
  });
  record('子時', '早子時 leaves hours outside 23時台 untouched',
    noon.day.text === noonLate.day.text && noon.hour.text === noonLate.hour.text,
    `${noon.day.text}/${noon.hour.text} either way`);
}

// --- §2.1  the correction must not reach the year and month pillars ---------
{
  const base = { year: 2024, month: 2, day: 4, hour: 17, minute: 15 };
  const utJd = julianDay(base.year, base.month, base.day, base.hour + base.minute / 60) - 9 / 24;
  // Iwamizawa is +27 min of local mean time. If that leaked into the term test,
  // a birth 12 minutes before 立春 would be pushed past it.
  const withCorrection = computePillars({ ut: utJd, local: utJd + 141.79 / 360, ziShi: 'late', hourKnown: true });
  const without = computePillars({ ut: utJd, local: utJd + 135 / 360, ziShi: 'late', hourKnown: true });
  record('§2.1 separation', 'local correction does not move the year or month pillar',
    withCorrection.year.text === without.year.text && withCorrection.month.text === without.month.text,
    `年 ${withCorrection.year.text}, 月 ${withCorrection.month.text} in both cases (立春 2024-02-04 17:27 JST)`);
}

// --- §3.1  the year pillar turns at 立春, and takes the month with it -------
// Regression: 立春 2024 falls at 17:27 JST. A birth minutes later must move to
// 甲辰 / 丙寅. Deriving 立春 as "first crossing after jdUt-366" returns the
// *previous* year's ingress here, which advanced the month while stranding the
// year — a self-inconsistent chart (甲寅 belongs to a 癸 year, not 甲辰's).
{
  const before = computePillars({
    ut: julianDay(2024, 2, 4, 17 + 15 / 60) - 9 / 24,
    local: julianDay(2024, 2, 4, 17 + 15 / 60), ziShi: 'late', hourKnown: true,
  });
  const after = computePillars({
    ut: julianDay(2024, 2, 4, 17 + 35 / 60) - 9 / 24,
    local: julianDay(2024, 2, 4, 17 + 35 / 60), ziShi: 'late', hourKnown: true,
  });
  const ok = before.year.text === '癸卯' && before.month.text === '乙丑'
    && after.year.text === '甲辰' && after.month.text === '丙寅';
  record('year boundary', '立春 moves the year and the month pillar together',
    ok, `17:15 → ${before.year.text}/${before.month.text}, 17:35 → ${after.year.text}/${after.month.text}`);

  // The month stem must stay consistent with the year stem across the ingress.
  const consistent = after.month.stem === (TIGER_MONTH_STEM[after.year.stem] + 0) % 10;
  record('year boundary', '月干 stays consistent with 年干 across 立春',
    consistent, `五虎遁(${STEMS[after.year.stem]}) → 寅月 ${STEMS[TIGER_MONTH_STEM[after.year.stem]]}寅`);
}

// --- §2.5  the error bar must actually sweep -------------------------------
// Regression: treating "no hour pillar" as "no clock" froze the sweep, so a
// timeless record on a day containing a 節入り wrongly reported one outcome.
{
  const onRisshunDay = {
    year: 2024, month: 2, day: 4, hour: 12, minute: 0,
    precision: 'unknown', longitude: 141.79,
  };
  const resolved = resolveUncertainty(onRisshunDay, DEFAULT_AXES);
  const charts = resolved.outcomes.map((o) => o.chart.pillars.year.text + o.chart.pillars.month.text);
  record('error bar', '時刻不明でも節入りを含む日は月柱・年柱が割れる',
    resolved.outcomes.length === 2 && charts.includes('癸卯乙丑') && charts.includes('甲辰丙寅'),
    `${resolved.outcomes.length} outcomes: ${charts.join(' / ')}`);

  const shifted = buildChartAtOffset(onRisshunDay, DEFAULT_AXES, 600);
  const back = buildChartAtOffset(onRisshunDay, DEFAULT_AXES, -600);
  record('error bar', 'buildChartAtOffset shifts the clock for timeless records too',
    shifted.signature !== back.signature, `${back.signature} vs ${shifted.signature}`);

  // A determinate record must stay determinate.
  const midday = { ...onRisshunDay, hour: 6, minute: 0, precision: 'pm1' };
  record('error bar', 'a record far from any boundary reports 確定',
    resolveUncertainty(midday, DEFAULT_AXES).state === 'determinate',
    resolveUncertainty(midday, DEFAULT_AXES).state);
}

// --- §2.4  the repeated hour at the end of daylight saving ------------------
{
  const probe = (y, mo, d, h) => japanOffsetHours(julianDay(y, mo, d, h));
  const repeated = probe(1948, 9, 12, 0.5); // 00:30 — happens twice
  const once = probe(1948, 9, 12, 1.5); // 01:30 JST — happens once
  const summer = probe(1948, 7, 1, 12);
  record('time zone', 'the hour repeated by the DST fall-back is flagged, the next hour is not',
    repeated.ambiguous === true && once.ambiguous === false && summer.ambiguous === false
    && once.offsetHours === 9 && summer.offsetHours === 10,
    `00:30 ambiguous=${repeated.ambiguous}, 01:30 ambiguous=${once.ambiguous} (UTC+${once.offsetHours})`);
}

// --- ephemeris coverage -----------------------------------------------------
// Outside the bundled files Swiss Ephemeris does not error: it switches to
// Moshier and says so only in serr. The input range is enforced against this.
{
  const raw = new SwissEph();
  await raw.initSwissEph();
  const flagAt = (year) => {
    const res = raw.SweModule._malloc(48);
    const err = raw.SweModule._malloc(256);
    const rf = raw.SweModule.ccall('swe_calc_ut', 'number',
      ['number', 'number', 'number', 'pointer', 'pointer'],
      [raw.julday(year, 6, 15, 12), 0, 2, res, err]);
    raw.SweModule._free(res);
    raw.SweModule._free(err);
    return rf;
  };
  const inside = flagAt(1800) === 2 && flagAt(2399) === 2;
  const outside = flagAt(1799) === 4 && flagAt(2400) === 4;
  record('ephemeris', `bundled files cover exactly ${EPHEMERIS_YEARS.from}-${EPHEMERIS_YEARS.to}`,
    inside && outside && withinEphemeris(1800) && withinEphemeris(2399)
    && !withinEphemeris(1799) && !withinEphemeris(2400),
    'retFlag 2 (SWIEPH) inside the range, 4 (Moshier fallback) outside — the input range matches');
}

// --- structural invariants over the whole supported range -------------------
// A deterministic sweep, so the result is reproducible. These invariants are
// what "the board is computed without compromise" reduces to mechanically: if
// any of them can be broken by some date, the chart is not trustworthy.
{
  let seed = 20240204;
  const rnd = (a, b) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return a + (seed % (b - a + 1));
  };
  const precisions = ['pm1', 'pm5', 'pm30', 'unknown'];
  const broken = { threw: 0, month: 0, hour: 0, period: 0, fraction: 0 };
  const samples = 400;

  for (let i = 0; i < samples; i += 1) {
    const input = {
      year: rnd(EPHEMERIS_YEARS.from, EPHEMERIS_YEARS.to),
      month: rnd(1, 12),
      day: rnd(1, 28),
      hour: rnd(0, 23),
      minute: rnd(0, 59),
      precision: precisions[rnd(0, 3)],
      longitude: 122 + rnd(0, 3200) / 100,
    };
    let chart;
    try {
      chart = buildChart(input, DEFAULT_AXES);
    } catch {
      broken.threw += 1;
      continue;
    }
    const { year, month, day, hour, period } = chart.pillars;

    if (month.stem !== (TIGER_MONTH_STEM[year.stem] + ((month.branch - 2) % 12 + 12) % 12) % 10) broken.month += 1;
    if (hour && hour.stem !== (RAT_HOUR_STEM[day.stem] + hour.branch) % 10) broken.hour += 1;
    if (!(period.start <= chart.time.ut && chart.time.ut < period.end)) broken.period += 1;

    const total = resolveUncertainty(input, DEFAULT_AXES).outcomes
      .reduce((sum, o) => sum + o.fraction, 0);
    if (Math.abs(total - 1) > 1e-6) broken.fraction += 1;
  }

  const clean = Object.values(broken).every((v) => v === 0);
  record('invariants', `${samples} charts across ${EPHEMERIS_YEARS.from}-${EPHEMERIS_YEARS.to}, all precisions`,
    clean,
    clean
      ? '月干=五虎遁(年干), 時干=五鼠遁(日干), 出生時刻 ∈ [節入り, 次の節入り), 誤差棒の合計=1 — すべて成立'
      : JSON.stringify(broken));

  // The day pillar must advance by exactly one per civil day, with no gap at
  // month or year ends.
  let dayBreaks = 0;
  for (let i = 0; i < 200; i += 1) {
    const y = rnd(EPHEMERIS_YEARS.from, EPHEMERIS_YEARS.to - 1);
    const m = rnd(1, 12);
    const d = rnd(1, 27);
    const a = pillarFromIndex(Math.floor(julianDay(y, m, d, 12) + 0.5) + DAY_PILLAR_OFFSET);
    const b = pillarFromIndex(Math.floor(julianDay(y, m, d + 1, 12) + 0.5) + DAY_PILLAR_OFFSET);
    if ((b.stem - a.stem + 10) % 10 !== 1 || (b.branch - a.branch + 12) % 12 !== 1) dayBreaks += 1;
  }
  record('invariants', 'day pillar advances by exactly one per civil day',
    dayBreaks === 0, `${200 - dayBreaks}/200 consecutive pairs step by one`);
}

// --- the dial's ingress list must agree with the engine ---------------------
// termIngresses() feeds the dial only, but a presentation layer that drifts
// from the pillars would label the chart with times the chart does not use.
{
  let mismatched = 0;
  let checked = 0;
  for (const method of ['teiki', 'kouki']) {
    for (const [y, m, d] of [[1990, 6, 15], [2024, 2, 4], [2024, 8, 20], [1955, 11, 2], [2026, 1, 9]]) {
      const ut = julianDay(y, m, d, 12) - 9 / 24;
      const period = termPeriod(ut, method);
      const list = termIngresses(ut, method);
      const entry = list.find((e) => e.term.name === period.term.name);
      checked += 1;
      // The listed ingress for the birth's own 節 must be the period it opened.
      if (!entry || Math.abs(entry.start - period.start) > 1 / 1440) mismatched += 1;
    }
  }
  record('invariants', "the dial's 節入り list matches the pillars' own term period",
    mismatched === 0, `${checked - mismatched}/${checked} agree to within a minute`);
}

// --- §8  the reading layer --------------------------------------------------
// The rule is absolute: no sentence without a source. It is checked two ways —
// that no unsourced statement escapes, and that every cited character is
// actually on the board, so a rule cannot cite something it invented.
{
  let seed = 4451;
  const rnd = (a, b) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return a + (seed % (b - a + 1));
  };

  let unsourced = 0;
  let fabricated = 0;
  let empty = 0;
  const signatures = new Map();
  const samples = 300;

  for (let i = 0; i < samples; i += 1) {
    const chart = buildChart({
      year: rnd(1930, 2030), month: rnd(1, 12), day: rnd(1, 28),
      hour: rnd(0, 23), minute: rnd(0, 59), precision: 'pm5',
      longitude: 122 + rnd(0, 3200) / 100,
    }, DEFAULT_AXES);

    const onBoard = new Set();
    for (const key of ['year', 'month', 'day', 'hour']) {
      const p = chart.pillars[key];
      if (p) { onBoard.add(p.stemChar); onBoard.add(p.branchChar); }
    }

    const statements = readChart(chart);
    if (statements.length === 0) empty += 1;
    for (const s of statements) {
      if (!Array.isArray(s.source) || s.source.length === 0) { unsourced += 1; continue; }
      for (const cite of s.source) {
        // Citations that name a position on the board must name a character
        // that is really there. element:/relation:/polarity: name no character.
        const m = cite.match(/(?:_stem|_branch|干|支|counted):(.)$/);
        if (m && !onBoard.has(m[1])) fabricated += 1;
      }
    }
    signatures.set(readingSignature(statements), true);
  }

  record('reading (§8)', 'no statement escapes readChart without a source',
    unsourced === 0, `${unsourced} unsourced statements across ${samples} charts`);
  record('reading (§8)', 'every cited character is actually on the board',
    fabricated === 0, `${fabricated} citations naming a character not in the chart`);
  record('reading (§8)', 'every chart receives at least one sourced statement (被覆率)',
    empty === 0, `${samples - empty}/${samples} charts covered`);

  const discrimination = signatures.size / samples;
  record('reading (§8)', 'readings discriminate between charts (弁別率, by source not text)',
    discrimination > 0.8,
    `${signatures.size}/${samples} distinct source-combinations = ${(discrimination * 100).toFixed(1)}%`);
}

// --- the 語り page ----------------------------------------------------------
// It is allowed to speak about the person, which the board reading is not. It
// is still held to: every passage sourced, every cited character really on the
// board, and every passage carrying a measured frequency — because the
// frequency is the reader's only defence against a passage that feels uncanny
// merely by being common.
{
  let seed = 77123;
  const rnd = (a, b) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return a + (seed % (b - a + 1));
  };
  const nowJd = julianDay(2026, 7, 29, 12);
  let unsourced = 0;
  let fabricated = 0;
  let unmeasured = 0;
  const signatures = new Set();
  const samples = 300;

  for (let i = 0; i < samples; i += 1) {
    const input = {
      year: rnd(1930, 2030), month: rnd(1, 12), day: rnd(1, 28),
      hour: rnd(0, 23), minute: rnd(0, 59), precision: 'pm5',
      longitude: 122 + rnd(0, 3200) / 100,
      sex: rnd(0, 1) === 0 ? 'male' : 'female',
    };
    const chart = buildChart(input, DEFAULT_AXES);

    const onBoard = new Set();
    for (const key of ['year', 'month', 'day', 'hour']) {
      const p = chart.pillars[key];
      if (p) { onBoard.add(p.stemChar); onBoard.add(p.branchChar); }
    }

    const passages = voiceStatements(chart, nowJd, input);
    for (const s of passages) {
      if (!Array.isArray(s.source) || s.source.length === 0) { unsourced += 1; continue; }
      for (const cite of s.source) {
        const m = cite.match(/(?:_stem|_branch|干|支):(.)$/);
        if (m && !onBoard.has(m[1])) fabricated += 1;
      }
      if (frequencyOf(s.key) === null) unmeasured += 1;
    }
    signatures.add(passages.map((s) => s.key).sort().join('|'));
  }

  record('語り (別ページ)', 'every passage is sourced',
    unsourced === 0, `${unsourced} unsourced passages across ${samples} charts`);
  record('語り (別ページ)', 'every cited character is actually on the board',
    fabricated === 0, `${fabricated} citations naming a character not in the chart`);
  record('語り (別ページ)', 'every passage carries a measured frequency',
    unmeasured === 0, `${unmeasured} passages missing from the rarity table`);
  record('語り (別ページ)', 'passages discriminate between charts',
    signatures.size / samples > 0.3,
    `${signatures.size}/${samples} distinct passage sets = ${((signatures.size / samples) * 100).toFixed(1)}%`);
}

// --- 姓名判断 ---------------------------------------------------------------
// Stroke counts come from KANJIDIC2 rather than Unihan because Unihan follows
// the Chinese form and disagrees with Japanese dictionaries on 辶 and 阝 — it
// gives 郎 as 8 where Japanese practice gives 9, and 郎 is everywhere in
// Japanese given names. Checked here against dictionary values.
{
  const known = [['山', 3], ['田', 5], ['中', 4], ['沢', 7], ['藤', 18], ['佐', 7],
    ['鈴', 13], ['高', 10], ['橋', 16], ['渡', 12], ['辺', 5], ['邊', 19],
    ['斎', 11], ['齋', 17], ['郎', 9], ['子', 3], ['村', 7], ['井', 4], ['響', 20]];
  const wrong = known.filter(([c, n]) => strokesOf(c) !== n);
  record('姓名判断', 'kanji stroke counts match Japanese dictionary values',
    wrong.length === 0,
    wrong.length === 0 ? `${known.length}/${known.length} characters agree (KANJIDIC2)`
      : wrong.map(([c, n]) => `${c}: got ${strokesOf(c)}, expected ${n}`).join('; '));

  // 濁点 and 半濁点 decompose rather than falling through as unknown.
  record('姓名判断', 'kana with 濁点/半濁点 are counted, not dropped',
    strokesOf('が') === 5 && strokesOf('ぱ') === 7 && strokesOf('さ') === 3,
    `が=${strokesOf('が')}, ぱ=${strokesOf('ぱ')}, さ=${strokesOf('さ')}`);

  // 五格 arithmetic, including the 霊数 asymmetry: it applies to 天格/地格/外格
  // but never to 人格 or 総格.
  const f = fiveGrids('村井', '響');
  const by = Object.fromEntries(f.grids.map((g) => [g.name, g.count]));
  const expected = { 人格: 24, 総格: 31, 天格: 11, 地格: 21, 外格: 8 };
  const bad = Object.entries(expected).filter(([k, v]) => by[k] !== v);
  record('姓名判断', '五格 arithmetic with 霊数 (村井/響: 7+4 / 20)',
    bad.length === 0,
    bad.length === 0 ? '人格24 総格31 天格11 地格21 外格8 — all as computed by hand'
      : bad.map(([k, v]) => `${k}: got ${by[k]}, expected ${v}`).join('; '));

  // A two-character given name must not pick up the 霊数.
  const g2 = fiveGrids('村井', '太郎');
  const by2 = Object.fromEntries(g2.grids.map((g) => [g.name, g.count]));
  record('姓名判断', '霊数 is not added when neither part is a single character',
    g2.reiSuu === false && by2['地格'] === 13 && by2['総格'] === 24 && by2['人格'] === 8,
    `太郎: 地格${by2['地格']}(4+9) 人格${by2['人格']}(井4+太4) 総格${by2['総格']}`);

  // 画数 -> 五行 by last digit.
  const elements = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(elementOfCount).join(',');
  record('姓名判断', '画数 maps to 五行 by its last digit',
    elements === 'water,wood,wood,fire,fire,earth,earth,metal,metal,water',
    '10水 1,2木 3,4火 5,6土 7,8金 9水');
}

// --- 大運 -------------------------------------------------------------------
// 陽男陰女 run forward, 陰男陽女 run back; 立運 counts days to the bracketing
// 節入り and divides by three. Both are checked against worked examples.
{
  // 甲 is stem 0 (陽), 乙 is 1 (陰).
  const dirs = [
    [0, 'male', 'forward'], [0, 'female', 'reverse'],
    [1, 'male', 'reverse'], [1, 'female', 'forward'],
  ];
  const wrong = dirs.filter(([stem, sex, want]) => luckDirection(stem, sex) !== want);
  record('大運', '順行／逆行 follows 陽男陰女',
    wrong.length === 0,
    wrong.length === 0 ? '陽男・陰女=順行、陰男・陽女=逆行 — 4/4' : JSON.stringify(wrong));

  const input = { year: 1990, month: 6, day: 15, hour: 6, minute: 20, precision: 'pm5', longitude: 141.79 };
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeStrength(chart.pillars);

  // 1990-06-15 06:20 JST: 年干 庚 (陽). Male runs forward to 小暑, female back
  // to 芒種 — the two directions must land on different terms and ages.
  const male = luckPeriods(chart, strength, 'male');
  const female = luckPeriods(chart, strength, 'female');
  const forwardDays = chart.pillars.period.end - chart.time.ut;
  const reverseDays = chart.time.ut - chart.pillars.period.start;
  record('大運', '立運 counts to the correct 節入り in each direction',
    male.direction === 'forward' && female.direction === 'reverse'
      && Math.abs(male.onset.days - forwardDays) < 1e-9
      && Math.abs(female.onset.days - reverseDays) < 1e-9,
    `順行 ${male.onset.days.toFixed(2)}日→${male.onset.years}歳${male.onset.months}ヶ月、`
    + `逆行 ${female.onset.days.toFixed(2)}日→${female.onset.years}歳${female.onset.months}ヶ月`);

  // Three days to a year, one leftover day to four months.
  const check = (days) => {
    const y = Math.floor(days / 3);
    return { y, m: Math.round((days - y * 3) * 4) };
  };
  const a = check(male.onset.days);
  record('大運', '3日で1年、余り1日で4ヶ月',
    male.onset.years === a.y && male.onset.months === a.m,
    `${male.onset.days.toFixed(2)}日 = ${a.y}年${a.m}ヶ月`);

  // The cycles step through the sexagenary order from the month pillar, ten
  // years apart, in the right direction.
  const steps = male.periods;
  const contiguous = steps.every((p, i) => i === 0 || p.fromAge === steps[i - 1].toAge);
  const forwardOrder = steps.every((p, i) => i === 0
    || ((p.pillar.stem - steps[i - 1].pillar.stem + 10) % 10 === 1
      && (p.pillar.branch - steps[i - 1].pillar.branch + 12) % 12 === 1));
  record('大運', 'cycles are contiguous and step one place through the 60-cycle',
    contiguous && forwardOrder,
    `${steps[0].pillar.text} → ${steps[1].pillar.text} → ${steps[2].pillar.text} …、10年刻み`);

  const reverseOrder = female.periods.every((p, i) => i === 0
    || ((female.periods[i - 1].pillar.stem - p.pillar.stem + 10) % 10 === 1));
  record('大運', '逆行 walks the cycle backwards',
    reverseOrder,
    `${female.periods[0].pillar.text} → ${female.periods[1].pillar.text} → ${female.periods[2].pillar.text} …`);

  record('大運', 'declining to give a sex omits 大運 rather than guessing',
    luckPeriods(chart, strength, null) === null, 'returns null, and the page says why');
}

// --- 蔵干 -------------------------------------------------------------------
// The table is hand-entered, so it is re-derived from its two structural rules
// rather than trusted. A typo here would silently bend every strength verdict.
{
  const table = hiddenTable();
  const byBranch = Object.fromEntries(table.map((t) => [t.branch, t.stems]));
  const stemElement = (ch) => STEM_ELEMENT[STEMS.indexOf(ch)];

  // 余気 = the 本気 of the branch before it, all the way round the cycle.
  const tailMisses = [];
  for (const [i, ch] of BRANCHES.entries()) {
    const prev = BRANCHES[(i + 11) % 12];
    const tail = byBranch[ch].find((h) => h.role === '余気');
    const prevMain = byBranch[prev].find((h) => h.role === '本気');
    if (!tail || stemElement(tail.stemChar) !== stemElement(prevMain.stemChar)) {
      tailMisses.push(`${ch}の余気${tail ? tail.stemChar : 'なし'} vs ${prev}の本気${prevMain.stemChar}`);
    }
  }
  record('蔵干', '余気 is the previous branch\'s 本気, for all twelve',
    tailMisses.length === 0,
    tailMisses.length === 0 ? '子←亥, 丑←子, 寅←丑 … 亥←戌 — 12/12' : tailMisses.join('; '));

  // 中気 = the element the branch's 三合 triad pools on.
  const midMisses = [];
  for (const triad of TRIADS) {
    for (const ch of triad.branches) {
      const mid = byBranch[ch].find((h) => h.role === '中気');
      if (NO_MIDDLE.includes(ch)) {
        if (mid) midMisses.push(`${ch} should have no 中気`);
        continue;
      }
      if (ch === '午') continue; // 午 is the documented exception: 己.
      if (!mid || mid.element !== triad.element) {
        midMisses.push(`${ch}の中気${mid ? mid.stemChar : 'なし'} vs 三合${triad.element}`);
      }
    }
  }
  record('蔵干', '中気 is the 三合局 partner (四正 excepted)',
    midMisses.length === 0,
    midMisses.length === 0 ? '寅午戌=火, 申子辰=水, 亥卯未=木, 巳酉丑=金 — all agree' : midMisses.join('; '));

  // Every branch is worth exactly 1, so the two strength runs stay comparable.
  const badShare = BRANCHES.filter((ch) => {
    const sum = hiddenStems(ch).reduce((t, h) => t + h.share, 0);
    return Math.abs(sum - 1) > 1e-9;
  });
  record('蔵干', 'each branch carries a total weight of exactly 1',
    badShare.length === 0,
    badShare.length === 0 ? '2支は0.7/0.3、3支は0.6/0.25/0.15 — 12/12 sum to 1' : badShare.join(', '));

  // Every hidden stem is a real stem.
  const unknown = BRANCHES.flatMap((ch) => hiddenStems(ch).filter((h) => h.stem < 0).map((h) => `${ch}:${h.stemChar}`));
  record('蔵干', 'every hidden stem is one of the ten',
    unknown.length === 0, unknown.length === 0 ? 'all resolve to 甲…癸' : unknown.join(', '));

  // Turning 蔵干 on must not silently rescale the score, and when the two runs
  // disagree the reading has to be able to say so.
  const chart = buildChart({ year: 2000, month: 1, day: 1, hour: 3, minute: 0, precision: 'pm5', longitude: 141.79 }, DEFAULT_AXES);
  const both = judgeBoth(chart.pillars);
  record('蔵干', 'both readings are computed and disagreement is reported',
    typeof both.agrees === 'boolean' && both.alternative
    && both.useHidden === true && both.alternative.useHidden === false,
    `2000-01-01 03:00: 蔵干あり ${both.label}(${both.score}) / なし ${both.alternative.label}(${both.alternative.score}) — ${both.agrees ? '一致' : '不一致'}`);
}

// --- 時の欄 -----------------------------------------------------------------
// The daily fortune must be built by the same engine as the natal chart: same
// 立春 for the year, same 節入り for the month. Computing "today" on the civil
// calendar while the natal reading uses solar terms would make the app
// contradict itself a dozen times a year.
{
  const input = { year: 1990, month: 6, day: 15, hour: 6, minute: 20, precision: 'pm5', longitude: 141.79 };
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeBoth(chart.pillars);
  // 2026-07-28 is 癸卯 per 国立天文台; the following day must be 甲辰.
  const fixed = new Date(2026, 6, 29, 12, 0);
  const t = timeline(input, strength, null, fixed);
  const today = t.rows.find((r) => r.scale === '今日');
  const thisYear = t.rows.find((r) => r.scale === '今年');
  record('時の欄', "today's pillar comes from the same day-pillar engine",
    today.pillar.text === '甲辰',
    `2026-07-29 → ${today.pillar.text}（前日 2026-07-28 は国立天文台で癸卯）`);
  record('時の欄', 'the year row turns at 立春, not 1 January',
    thisYear.pillar.text === '丙午' && t.nowChart.pillars.solarYear === 2026,
    `${t.nowChart.pillars.solarYear}年 ${thisYear.pillar.text}`);

  // A January date before 立春 still belongs to the previous solar year.
  const beforeRisshun = timeline(input, strength, null, new Date(2026, 0, 10, 12, 0));
  record('時の欄', 'January before 立春 reads as the previous solar year',
    beforeRisshun.nowChart.pillars.solarYear === 2025,
    `2026-01-10 → ${beforeRisshun.nowChart.pillars.solarYear}年 ${beforeRisshun.rows.find((r) => r.scale === '今年').pillar.text}`);

  record('時の欄', 'the 10-year row is omitted when no sex was given',
    !t.rows.some((r) => r.scale === '10年'),
    `rows: ${t.rows.map((r) => r.scale).join('・')}`);
}

// --- consistency between the two pages --------------------------------------
// Both pages must reach the same verdict. They briefly did not: the board page
// judged without 蔵干 and the 語り page judged with it, so the same birth data
// was told "身弱, lean on 火と土" on one page and "中庸, lean on 金" on the
// other — opposite advice from one app.
{
  const cases = [
    [1990, 6, 15, 6, 20], [2000, 1, 1, 3, 0], [1984, 2, 2, 12, 0], [1955, 8, 15, 20, 0],
  ];
  const mismatched = [];
  for (const [y, m, d, h, mi] of cases) {
    const input = { year: y, month: m, day: d, hour: h, minute: mi, precision: 'pm5', longitude: 141.79 };
    const chart = buildChart(input, DEFAULT_AXES);
    const board = summarise(chart);
    const voice = judgeBoth(chart.pillars);
    if (board.strength.verdict !== voice.verdict
      || board.strength.needed.join() !== voice.needed.join()) {
      mismatched.push(`${y}-${m}-${d}: 盤 ${board.strength.label} vs 語り ${voice.label}`);
    }
  }
  record('consistency', 'the board page and the 語り page reach the same verdict',
    mismatched.length === 0,
    mismatched.length === 0 ? `${cases.length}/${cases.length} charts agree on both 判定 and 用神` : mismatched.join('; '));
}

// --- "now" is reckoned in Japan, not on the device ---------------------------
// The app is declared domestic, so the device's timezone must not decide what
// day it is. Read off a local Date, today's pillar is a day out for anyone
// abroad — and the daily fortune is the part people open every day.
{
  const input = { year: 1990, month: 6, day: 15, hour: 6, minute: 20, precision: 'pm5', longitude: 141.79 };
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeBoth(chart.pillars);

  // 02:00 JST on 29 July is still 28 July in New York and 27 July in Honolulu.
  const instant = new Date('2026-07-29T02:00:00+09:00');
  const jst = japanNow(instant);
  const t = timeline(input, strength, null, instant);
  const today = t.rows.find((r) => r.scale === '今日');
  record('now in Japan', "today's pillar is the Japanese day, not the device's",
    jst.day === 29 && jst.month === 7 && today.pillar.text === '甲辰' && today.when === '7月29日',
    `JST ${jst.month}/${jst.day} → ${today.when} ${today.pillar.text}`);

  // A birthday must turn over at Japanese midnight, not UTC midnight.
  const onBirthday = new Date('2026-06-15T00:30:00+09:00');
  const dayBefore = new Date('2026-06-14T23:30:00+09:00');
  record('now in Japan', 'age turns over at Japanese midnight',
    ageNow(input, onBirthday) === 36 && ageNow(input, dayBefore) === 35,
    `6/15 00:30 JST → ${ageNow(input, onBirthday)}歳、6/14 23:30 JST → ${ageNow(input, dayBefore)}歳`);
}

// --- 立運 months are not rounded away ---------------------------------------
// 立運 of "7歳6ヶ月" rounded down to 7 puts a seven-year-old inside a cycle
// that has not started, wrong by up to a year at the one boundary a reader is
// most likely to be sitting on.
{
  const input = { year: 1990, month: 6, day: 15, hour: 6, minute: 20, precision: 'pm5', longitude: 141.79 };
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeBoth(chart.pillars);
  const luck = luckPeriods(chart, strength, 'male');
  const before = cycleAtAge(luck, luck.onset.years + 0.1);
  const after = cycleAtAge(luck, luck.onset.years + luck.onset.months / 12 + 0.1);
  record('大運', '立運 months count toward the first cycle boundary',
    luck.onset.months > 0 && before === null && after === luck.periods[0],
    `立運 ${luck.onset.years}歳${luck.onset.months}ヶ月: ${luck.onset.years}.1歳=まだ、`
    + `${(luck.onset.years + luck.onset.months / 12).toFixed(1)}歳=第1期`);

  record('大運', 'ageExact and ageNow agree on whole years',
    Math.floor(ageExact(input, new Date('2026-07-29T12:00:00+09:00')))
      === ageNow(input, new Date('2026-07-29T12:00:00+09:00')),
    `${ageExact(input, new Date('2026-07-29T12:00:00+09:00')).toFixed(2)} → ${ageNow(input, new Date('2026-07-29T12:00:00+09:00'))}歳`);
}

// --- 目盛りと場面ごとの箇条書き（伝え方の層） -------------------------------
//
// This layer restates computed facts; it must never introduce one. The checks
// below are about that boundary: ranges stay in range, the strength gauge cannot
// disagree with the verdict it is drawn from, and no bullet ever reaches a
// reader without the characters it came from.
{
  let seed = 4242;
  const rnd = (a, b) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return a + (seed % (b - a + 1)); };
  const SAMPLES = 2000;

  let outOfRange = 0;
  let verdictMismatch = 0;
  let unstableMissed = 0;
  let unsourcedGauge = 0;
  let unsourcedBullet = 0;
  let emptySection = 0;
  let overCap = 0;
  let badRootCount = 0;
  let cardsEmpty = 0;
  const seenKeys = new Set();

  for (let i = 0; i < SAMPLES; i += 1) {
    const input = {
      year: rnd(1930, 2030), month: rnd(1, 12), day: rnd(1, 28),
      hour: rnd(0, 23), minute: rnd(0, 59),
      // One chart in ten has no recorded time, so the three-pillar path is swept
      // too. judgeStrength threw on exactly this input before it was guarded.
      precision: rnd(0, 9) === 0 ? 'unknown' : 'pm5',
      longitude: 122 + rnd(0, 3200) / 100,
      sex: rnd(0, 1) === 0 ? 'male' : 'female',
    };
    const chart = buildChart(input, DEFAULT_AXES);
    const strength = judgeBoth(chart.pillars);

    const branches = ['year', 'month', 'day', 'hour'].filter((k) => chart.pillars[k]).length;
    if (!Number.isInteger(strength.rootCount) || strength.rootCount < 0
      || strength.rootCount > branches
      || strength.rooted !== (strength.rootCount > 0)) badRootCount += 1;

    for (const g of gauges(chart, strength)) {
      if (!Number.isFinite(g.percent) || g.percent < 0 || g.percent > 100) outOfRange += 1;
      if (!g.source || g.source.length === 0) unsourcedGauge += 1;
      if (g.verdict) {
        // percent is distance toward the left pole, and the left pole is 力が余る.
        // 身強 must therefore sit right of centre, 身弱 left of it.
        const side = g.percent > 50 ? 'strong' : g.percent < 50 ? 'weak' : 'neutral';
        const consistent = g.verdict === 'neutral'
          ? Math.abs(g.percent - 50) <= g.band
          : side === g.verdict;
        if (!consistent) verdictMismatch += 1;
        if (!strength.agrees && !(g.unstable && g.unstableNote)) unstableMissed += 1;
      }
    }

    const scenes = domainBullets(chart, strength);
    for (const { key } of DOMAINS) {
      const bullets = scenes[key].bullets;
      if (bullets.length === 0) emptySection += 1;
      if (bullets.length > MAX_PER_DOMAIN) overCap += 1;
    }
    for (const st of domainStatements(chart, strength)) {
      if (!st.text || !st.key || !st.source || st.source.length === 0) unsourcedBullet += 1;
      seenKeys.add(st.key);
    }
    if (summaryCards(chart, strength).some((c) => c.bullets.length === 0)) cardsEmpty += 1;
  }

  record('伝え方', '目盛りは4本すべて 0〜100 に収まる',
    outOfRange === 0, `${SAMPLES}命式 × 4本、範囲外 ${outOfRange} 件（±${SCORE_SCALE} でクランプ）`);

  record('伝え方', '力の目盛りは身強身弱の判定と必ず同じ側を指す',
    verdictMismatch === 0, `食い違い ${verdictMismatch} 件`);

  record('伝え方', '蔵干で判定が割れる命式では目盛りに警告が出る',
    unstableMissed === 0, `警告漏れ ${unstableMissed} 件`);

  record('伝え方', '目盛りと箇条書きは出典なしでは生成されない',
    unsourcedGauge === 0 && unsourcedBullet === 0,
    `出典なしの目盛り ${unsourcedGauge} 件、箇条書き ${unsourcedBullet} 件`);

  record('伝え方', '4場面はどれも空にならず、上限を超えない',
    emptySection === 0 && overCap === 0 && cardsEmpty === 0,
    `空の場面 ${emptySection} 件、${MAX_PER_DOMAIN}件超過 ${overCap} 件、空のカード ${cardsEmpty} 件`);

  // A regression, kept by name because it was a live crash: the 通根 loop in
  // judgeStrength read pillars.hour without guarding for it, so every reader who
  // left the birth time blank got "読めませんでした" instead of a reading — on
  // both pages, since reading.js judges through the same function.
  {
    const timeless = { year: 1990, month: 6, day: 15, hour: 12, minute: 0, precision: 'unknown', longitude: 139.7, sex: 'male' };
    const c = buildChart(timeless, DEFAULT_AXES);
    let ok = false;
    let detail = '';
    try {
      const st = judgeBoth(c.pillars);
      const bullets = domainStatements(c, st).length;
      const bars = gauges(c, st).length;
      ok = c.pillars.hour === null && bars === 4 && bullets > 0;
      detail = `${c.signature} → ${st.label}、目盛り${bars}本、箇条書き${bullets}件`;
    } catch (error) {
      detail = `例外: ${error.message}`;
    }
    record('伝え方', '時刻不明の三柱でも判定と箇条書きが出る（例外を投げない）', ok, detail);
  }

  record('伝え方', 'rootCount は地支の本数を超えず rooted と矛盾しない',
    badRootCount === 0, `矛盾 ${badRootCount} 件（土台ありの境目は ${ROOTED_AT} 本）`);

  // Every bullet cites a frequency, so every key has to exist in the table the
  // generator wrote. A missing one silently drops the "◯人に1人" chip, which is
  // how the honest-statistics claim would quietly stop being true.
  const missingFreq = [...seenKeys].filter((k) => frequencyOf(k) === null);
  record('伝え方', '全ての箇条書きキーが頻度表に載っている',
    missingFreq.length === 0,
    `${seenKeys.size} 種のキーのうち、頻度が無いもの ${missingFreq.length} 件`
    + `${missingFreq.length ? `: ${missingFreq.slice(0, 4).join(', ')}` : ''}`);

  // 決定論: the same birth must always produce the same page. A rotation or a
  // random pick would read as variety and destroy the frequency claims.
  const fixed = { year: 1990, month: 6, day: 15, hour: 6, minute: 30, precision: 'pm5', longitude: 141.77, sex: 'male' };
  const once = buildChart(fixed, DEFAULT_AXES);
  const twice = buildChart(fixed, DEFAULT_AXES);
  const keysOf = (c) => domainStatements(c, judgeBoth(c.pillars)).map((b) => b.key).join('|');
  record('伝え方', '同じ生年月日は毎回同じ箇条書きを出す',
    keysOf(once) === keysOf(twice), `${domainStatements(once, judgeBoth(once.pillars)).length} 件が一致`);
}

// --- report -----------------------------------------------------------------

const bySection = new Map();
for (const r of results) {
  if (!bySection.has(r.section)) bySection.set(r.section, []);
  bySection.get(r.section).push(r);
}

let md = `# VERIFY.md

Generated by \`node tools/verify.mjs\`. Do not edit by hand — re-run it.

Swiss Ephemeris ${ephemerisVersion()}, bundled in \`vendor/swisseph-wasm/\`
(\`seas_18.se1\`, \`semo_18.se1\`, \`sepl_18.se1\`, covering 1800–2399).

**${results.length - failures}/${results.length} checks passed.**

`;

for (const [section, rows] of bySection) {
  md += `## ${section}\n\n| | check | detail |\n|---|---|---|\n`;
  for (const r of rows) {
    md += `| ${r.passed ? '✓' : '✗'} | ${r.name} | ${r.detail} |\n`;
  }
  md += '\n';
}

md += `## Sources

- 国立天文台 暦計算室, 暦要項「二十四節気および雑節」and「二十四節気・雑節」
  <https://eco.mtk.nao.ac.jp/koyomi/>
- 国立天文台 暦計算室「通日・曜日・干支」
  <https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/cande/cale2j.cgi>
- ksuimei.com 万年暦（干支暦）<https://ksuimei.com/cgi_bin/04_karte/50_koyomi.cgi>
- Jean Meeus, *Astronomical Algorithms*, 2nd ed., Example 25.b
- IANA time zone database, \`Asia/Tokyo\`

## Notes

- The day-pillar offset ${DAY_PILLAR_OFFSET} was derived from the two almanacs above,
  not from memory, and every one of the ${DAY_PILLARS.length} sampled dates implies the same value.
  It was never tuned to make a disagreement go away.
- \`swe_time_equ\` returns apparent minus mean solar time. The sign was settled by
  measurement at both annual extremes, not by reading the documentation.
- Solar-term searches are anchored a few days before the term being sought.
  \`swe_solcross_ut\` returns the *next* crossing, so a loose anchor silently
  returns the previous year's term — this bit the first draft of this file.
`;

writeFileSync(join(ROOT, 'VERIFY.md'), md);

for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.section} :: ${r.name}\n      ${r.detail}`);
}
console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.error('\nVERIFICATION FAILED — do not proceed past the gate.');
  process.exit(1);
}

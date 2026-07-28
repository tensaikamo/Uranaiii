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
import { initEphemeris, ephemerisVersion, sunLongitude, equationOfTime, sunCrossing, julianDay, calendarDate, deltaTSeconds } from '../app/engine/swe.js';
import { trueTermPeriod, meanTermPeriod, degreesSinceRisshun, SETSU } from '../app/engine/terms.js';
import { computePillars, TIGER_MONTH_STEM, RAT_HOUR_STEM, DAY_PILLAR_OFFSET, pillarFromIndex, STEMS, BRANCHES } from '../app/engine/pillars.js';
import { japanOffsetHours } from '../app/engine/time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failures = 0;

function record(section, name, passed, detail) {
  results.push({ section, name, passed, detail });
  if (!passed) failures += 1;
}

const jstString = (jd) => {
  const r = calendarDate(jd + 9 / 24);
  const h = Math.floor(r.hour);
  let m = Math.round((r.hour - h) * 60);
  let hh = h;
  if (m === 60) { m = 0; hh += 1; }
  return `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

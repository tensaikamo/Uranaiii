/**
 * Measure how often each reading statement occurs, and write the table the
 * reading layer cites.
 *
 * Telling a reader that a configuration appears in about one chart in four is
 * the honest version of "this is significant". It is computed, not asserted,
 * and it works against the Barnum effect rather than for it: a statement that
 * turns out to be near-universal is labelled as such instead of being dressed
 * up as personal insight.
 *
 * Run:  node tools/build-rarity.mjs [samples] [YYYY-MM-DD]
 * Writes app/engine/rarity.js. Re-run it whenever a rule changes. The date pins
 * the moment-dependent keys (年運・日運) so the table can be reproduced.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sampler } from './random.mjs';

import { initEphemeris } from '../app/engine/swe.js';
import { buildChart, DEFAULT_AXES } from '../app/engine/chart.js';
import { rawStatements } from '../app/engine/reading.js';
import { voiceStatements } from '../app/engine/voice.js';
import { domainStatements } from '../app/engine/domains.js';
import { oracleStatements } from '../app/engine/oracle.js';
import { glanceStatements } from '../app/engine/glance.js';
import { elementBalance } from '../app/engine/pillars.js';
import { timeline } from '../app/engine/timeline.js';
import { judgeBoth } from '../app/engine/strength.js';
import { luckPeriods, cycleAtAge, ageExact } from '../app/engine/luck.js';
import { julianDay } from '../app/engine/swe.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = Number(process.argv[2]) || 20000;

await initEphemeris();

// The 年運 and 日運 passages compare the chart against the year and the day in
// progress, so their frequencies are necessarily "as of a date" — they answer
// "of everybody, how many are in a pressure year today", which is what they
// should mean. But a date-dependent number has to *say* its date, or nobody can
// reproduce it. So it is stamped into the generated file, and can be pinned:
//
//   node tools/build-rarity.mjs 20000 2026-07-30
//
// One "now" drives the whole reading (see speak() in voice.js); this is it.
const pinned = process.argv[3];
const now = pinned ? new Date(`${pinned}T03:00:00Z`) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`第2引数の日付が読めません: ${pinned}（例: 2026-07-30）`);
  process.exit(1);
}
const nowJdUt = julianDay(
  now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
  now.getUTCHours() + now.getUTCMinutes() / 60,
);
const COUNTED_ON = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const rnd = sampler(20260729);

/** The element ruling the day the table is counted on. */
function todayElementOf(chart, strength, input) {
  const luck = luckPeriods(chart, strength, input.sex);
  const rows = timeline(input, strength, luck, now).rows;
  return rows.length ? rows[rows.length - 1].pillar.stemElement : null;
}

/** The 大運 the reader stands in today — one of the per-scene bullet's materials. */
function luckNow(chart, strength, input) {
  const luck = luckPeriods(chart, strength, input.sex);
  const cycle = luck ? cycleAtAge(luck, ageExact(input, now)) : null;
  return cycle ? cycle.fit : null;
}

const counts = new Map();

for (let i = 0; i < SAMPLES; i += 1) {
  const input = {
    year: rnd(1930, 2030), month: rnd(1, 12), day: rnd(1, 28),
    hour: rnd(0, 23), minute: rnd(0, 59),
    // One in ten has no recorded birth time. The app accepts a timeless record
    // as three pillars (§2.5), and the sample has to cover the input space the
    // app accepts: keys that only occur on a three-pillar chart were otherwise
    // absent from this table, which silently drops their "◯人に1人" chip — the
    // one number the reading offers as a check against feeling spoken to.
    precision: rnd(0, 9) === 0 ? 'unknown' : 'pm5',
    longitude: 122 + rnd(0, 3200) / 100,
    sex: rnd(0, 1) === 0 ? 'male' : 'female',
  };
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeBoth(chart.pillars);

  // A chart counts once per distinct key, not once per statement, so a rule
  // that fires twice on one chart does not inflate its own frequency.
  // Both layers are measured into one table: the 語り page cites the same
  // frequencies, and it needs them most.
  // The per-scene bullets are measured too. They are the lines a reader is most
  // likely to feel spoken to by, so they are the ones that most need a number
  // beside them saying how many other people got the same sentence.
  const seen = new Set([
    ...rawStatements(chart).map((s) => s.key),
    ...voiceStatements(chart, nowJdUt, input).map((s) => s.key),
    ...domainStatements(chart, strength, { luckFit: luckNow(chart, strength, input) }).map((s) => s.key),
    ...oracleStatements(chart, strength, { luckFit: luckNow(chart, strength, input) }).map((s) => s.key),
    // The at-a-glance layer. These are the lines a reader meets first, so they
    // are the ones that most need a number saying how many other people got
    // the same one — a headline is exactly the shape a Barnum line takes.
    ...glanceStatements(chart, strength, elementBalance(chart.pillars), {
      luck: luckPeriods(chart, strength, input.sex),
      todayElement: todayElementOf(chart, strength, input),
      age: ageExact(input, now),
    }).map((s) => s.key),
  ]);
  for (const key of seen) counts.set(key, (counts.get(key) || 0) + 1);
}

const table = Object.fromEntries(
  [...counts.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key, n]) => [key, Number((n / SAMPLES).toFixed(5))]),
);

const body = `/**
 * How often each reading statement occurs, measured over ${SAMPLES.toLocaleString('en-US')} random charts.
 *
 * GENERATED by tools/build-rarity.mjs — do not edit by hand, re-run it.
 *
 * Both the board reading and the 語り page cite these, so a reader can tell an
 * unusual configuration from a near-universal one. Without them, "月支が午で火"
 * reads as a personal revelation when it is true of a twelfth of everybody.
 *
 * Keys that name a moment — year:, today:, tl:, adviceYear:, luck: — are
 * relative to **${COUNTED_ON}** (JST), the day this table was counted on. A
 * "this year is a headwind" frequency has to be as of some year; saying which
 * one is the difference between a measurement and a decoration. Re-run with a
 * pinned date to reproduce:  node tools/build-rarity.mjs ${SAMPLES} ${COUNTED_ON}
 */

export const RARITY_SAMPLES = ${SAMPLES};

/** JST date the moment-dependent keys were measured against. */
export const RARITY_COUNTED_ON = '${COUNTED_ON}';

export const RARITY = ${JSON.stringify(table, null, 2)};

/** Frequency of a statement key, or null when it was never measured. */
export function frequencyOf(key) {
  return Object.prototype.hasOwnProperty.call(RARITY, key) ? RARITY[key] : null;
}
`;

writeFileSync(join(ROOT, 'app/engine/rarity.js'), body);

console.log(`measured ${counts.size} distinct statement keys over ${SAMPLES} charts`);
console.log('\nrarest 10:');
for (const [key, freq] of Object.entries(table).slice(0, 10)) {
  console.log(`  ${(freq * 100).toFixed(2).padStart(6)}%  ${key}`);
}
console.log('\nmost common 10:');
for (const [key, freq] of Object.entries(table).slice(-10)) {
  console.log(`  ${(freq * 100).toFixed(2).padStart(6)}%  ${key}`);
}
console.log('\nwrote app/engine/rarity.js');

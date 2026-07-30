/**
 * Anti-Barnum measurement for the reading layer (spec, appendix).
 *
 *   被覆率      the share of charts that get at least one sourced statement
 *   組み合わせ数  how many *different* readings the rules can produce at all
 *   最頻共有率    the share of people who get the single most common reading
 *
 * Discrimination is measured on the *combination of sources*, never on the
 * rendered text. Measuring text would reward a rule for rephrasing the same
 * claim, which is precisely the failure this number exists to catch.
 *
 * There used to be a 弁別率 here, defined as distinct-combinations ÷ samples.
 * It was worse than useless, because **it falls as the sample grows**: the same
 * engine and the same rules measured 46.2% at 1,000 charts and 2.4% at 40,000.
 * Any number quoted from it was really a statement about the sample size. What
 * matters is where the distinct-combination count *saturates* — that is the
 * ceiling on how many different readings exist, and it does not move — together
 * with the share of people who collide on the commonest one.
 *
 * 被覆率 × 弁別率 is the objective. This tool only measures it — the
 * self-improving loop the appendix describes is deliberately not built, because
 * an optimiser pointed at a domain with no ground truth converges on "pleasant
 * to read", which is a Barnum machine.
 *
 * Run:  node tools/reading-metrics.mjs [sampleCount]
 */

import { initEphemeris, EPHEMERIS_YEARS } from '../app/engine/swe.js';
import { buildChart, DEFAULT_AXES } from '../app/engine/chart.js';
import { readChart, readingSignature, RULES } from '../app/engine/reading.js';
import { domainStatements } from '../app/engine/domains.js';
import { judgeBoth } from '../app/engine/strength.js';
import { luckPeriods, cycleAtAge, ageExact } from '../app/engine/luck.js';

const SAMPLES = Number(process.argv[2]) || 1000;
// Pinned so the 大運 material is measured against a stated day, like rarity.js.
const NOW = new Date('2026-07-30T03:00:00Z');

await initEphemeris();

// Deterministic, so the number is reproducible between runs.
let seed = 8103;
const rnd = (a, b) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return a + (seed % (b - a + 1));
};

const signatures = new Map();
// The ceiling: no reading layer can distinguish more cases than there are
// distinct 命式 to distinguish. Without it, a combination count is a number with
// nothing to compare it to.
const charts = new Map();
const bulletSignatures = new Map();
const bulletHits = new Map();
let bulletTotal = 0;
let covered = 0;
let statementTotal = 0;
let unsourced = 0;
const ruleHits = new Map(RULES.map((r) => [r.name, 0]));

for (let i = 0; i < SAMPLES; i += 1) {
  const input = {
    year: rnd(1930, 2030),
    month: rnd(1, 12),
    day: rnd(1, 28),
    hour: rnd(0, 23),
    minute: rnd(0, 59),
    // Same 1-in-10 timeless share as build-rarity, so the two agree on what
    // input space is being measured.
    precision: rnd(0, 9) === 0 ? 'unknown' : 'pm5',
    longitude: 122 + rnd(0, 3200) / 100,
  };
  const chart = buildChart(input, DEFAULT_AXES);
  charts.set(chart.signature, 1);
  const statements = readChart(chart);

  if (statements.length > 0) covered += 1;
  statementTotal += statements.length;
  for (const s of statements) {
    if (!Array.isArray(s.source) || s.source.length === 0) unsourced += 1;
  }
  for (const rule of RULES) {
    if (rule(chart).length > 0) ruleHits.set(rule.name, ruleHits.get(rule.name) + 1);
  }

  const sig = readingSignature(statements);
  signatures.set(sig, (signatures.get(sig) || 0) + 1);

  // The delivery layer is measured separately. These are the lines a reader
  // actually reads first, so they are the ones most able to feel personal while
  // being true of everybody — the exact failure this file exists to catch.
  const st = judgeBoth(chart.pillars);
  const lk = luckPeriods(chart, st, input.sex);
  const cyc = lk ? cycleAtAge(lk, ageExact(input, NOW)) : null;
  const bullets = domainStatements(chart, st, { luckFit: cyc ? cyc.fit : null });
  bulletTotal += bullets.length;
  for (const b of bullets) {
    if (!Array.isArray(b.source) || b.source.length === 0) unsourced += 1;
    bulletHits.set(b.key, (bulletHits.get(b.key) || 0) + 1);
  }
  const bulletSig = bullets.map((b) => b.source.join(',')).sort().join('|');
  bulletSignatures.set(bulletSig, (bulletSignatures.get(bulletSig) || 0) + 1);
}

const coverage = covered / SAMPLES;
const distinct = signatures.size;
const unique = [...signatures.values()].filter((n) => n === 1).length;
const boardMost = Math.max(...signatures.values());

const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`sample: ${SAMPLES} charts, ${EPHEMERIS_YEARS.from}-${EPHEMERIS_YEARS.to} range restricted to 1930-2030`);
console.log(`ceiling: ${charts.size} distinct 命式 reachable in this sample\n`);
console.log(`被覆率 (coverage)        ${pct(coverage)}   ${covered}/${SAMPLES} charts got a sourced statement`);
console.log(`組み合わせ数             ${distinct}   different board readings exist`);
console.log(`  上限到達率             ${pct(distinct / charts.size)}   of the ${charts.size} distinct 命式`);
console.log(`  最頻共有率             ${pct(boardMost / SAMPLES)}   most common reading is shared by ${boardMost} charts`);
console.log(`  一意                   ${unique} charts share their reading with no other`);
console.log(`\nstatements per chart     ${(statementTotal / SAMPLES).toFixed(2)} average`);
console.log(`unsourced statements     ${unsourced}   (must be 0 — the filter is in readChart)`);
console.log(`\nRe-run at two sample sizes and compare 組み合わせ数. If it is still climbing,`);
console.log(`the count has not saturated yet and is a floor, not a ceiling.`);

console.log('\nrule fire rates:');
for (const [name, hits] of ruleHits) {
  console.log(`  ${name.padEnd(20)} ${pct(hits / SAMPLES).padStart(7)}`);
}

const most = [...signatures.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`\nmost common reading shared by ${most[1]} charts (${pct(most[1] / SAMPLES)})`);

/* --- the delivery layer: bars and per-scene bullets ----------------------- */

const bulletMost = Math.max(...bulletSignatures.values());
console.log(`\n--- 伝え方の層（目盛り・場面ごとの箇条書き） ---`);
console.log(`組み合わせ数             ${bulletSignatures.size}   different bullet-sets exist`);
console.log(`  上限到達率             ${pct(bulletSignatures.size / charts.size)}   of the ${charts.size} distinct 命式`);
console.log(`  最頻共有率             ${pct(bulletMost / SAMPLES)}   most common bullet-set is shared by ${bulletMost} charts`);
console.log(`bullets per chart        ${(bulletTotal / SAMPLES).toFixed(2)} average`);

// Any single line true of most people is a Barnum line, whatever it feels like
// to read. Listed so it can be split into something that discriminates — that is
// how the 通根 yes/no became a count.
const common = [...bulletHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('\nmost common single bullets:');
for (const [key, hits] of common) {
  const flag = hits / SAMPLES >= 0.7 ? '  <- Barnum risk' : '';
  console.log(`  ${pct(hits / SAMPLES).padStart(7)}  ${key}${flag}`);
}

if (unsourced > 0) {
  console.error('\nFAILED: an unsourced statement escaped readChart.');
  process.exit(1);
}

/**
 * Anti-Barnum measurement for the reading layer (spec, appendix).
 *
 *   被覆率  the share of charts that get at least one sourced statement
 *   弁別率  the share of charts whose readings differ from one another
 *
 * Discrimination is measured on the *combination of sources*, never on the
 * rendered text. Measuring text would reward a rule for rephrasing the same
 * claim, which is precisely the failure this number exists to catch.
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

const SAMPLES = Number(process.argv[2]) || 1000;

await initEphemeris();

// Deterministic, so the number is reproducible between runs.
let seed = 8103;
const rnd = (a, b) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return a + (seed % (b - a + 1));
};

const signatures = new Map();
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
    precision: 'pm5',
    longitude: 122 + rnd(0, 3200) / 100,
  };
  const chart = buildChart(input, DEFAULT_AXES);
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
}

const coverage = covered / SAMPLES;
const distinct = signatures.size;
// A chart is discriminated if no other chart in the sample shares its sources.
const unique = [...signatures.values()].filter((n) => n === 1).length;
const discrimination = distinct / SAMPLES;

const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`sample: ${SAMPLES} charts, ${EPHEMERIS_YEARS.from}-${EPHEMERIS_YEARS.to} range restricted to 1930-2030\n`);
console.log(`被覆率 (coverage)        ${pct(coverage)}   ${covered}/${SAMPLES} charts got a sourced statement`);
console.log(`弁別率 (discrimination)  ${pct(discrimination)}   ${distinct} distinct source-combinations`);
console.log(`  of which unique        ${unique} charts share their reading with no other`);
console.log(`\n被覆率 × 弁別率          ${pct(coverage * discrimination)}   <- the anti-Barnum objective`);
console.log(`\nstatements per chart     ${(statementTotal / SAMPLES).toFixed(2)} average`);
console.log(`unsourced statements     ${unsourced}   (must be 0 — the filter is in readChart)`);

console.log('\nrule fire rates:');
for (const [name, hits] of ruleHits) {
  console.log(`  ${name.padEnd(20)} ${pct(hits / SAMPLES).padStart(7)}`);
}

const most = [...signatures.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`\nmost common reading shared by ${most[1]} charts (${pct(most[1] / SAMPLES)})`);

if (unsourced > 0) {
  console.error('\nFAILED: an unsourced statement escaped readChart.');
  process.exit(1);
}

/**
 * Error bars (spec §2.5).
 *
 * A recorded birth time is a measurement, so it carries an uncertainty, and
 * the chart inherits it. The important and slightly counter-intuitive part:
 * the error bar reaches the 節入り as well as the 時辰. A ±30 minute window can
 * straddle a term ingress, which moves the month pillar, and near 立春 the year
 * pillar with it. That is a bigger change than an hour branch, not a smaller
 * one.
 */

import { calendarDate, julianDay } from './swe.js';
import { buildChart, buildChartAtOffset } from './chart.js';

export const PRECISIONS = [
  { value: 'pm1', label: '±1分', minutes: 1, note: '母子手帳に分単位の記載' },
  { value: 'pm5', label: '±5分', minutes: 5, note: '出生証明書が5分刻み' },
  { value: 'pm30', label: '±30分', minutes: 30, note: '「朝6時ごろ」などの伝聞' },
  { value: 'unknown', label: '不明', minutes: null, note: '三柱として扱う' },
];

export function precisionMinutes(value) {
  const found = PRECISIONS.find((p) => p.value === value);
  return found ? found.minutes : null;
}

/** Hours at which the local clock crosses a pillar boundary. */
const HOUR_BOUNDARIES = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

/**
 * Instants inside the window at which some pillar could change.
 *
 * Local-clock boundaries (day rollover, hour branch) are enumerated exactly
 * from the calendar rather than found by search, and the term ingress comes
 * straight from the ephemeris. Everything is expressed as an offset in minutes
 * from the recorded time so it can be compared against the error bar directly.
 */
function candidateBoundaries(input, axes, minutes) {
  const centre = buildChart(input, axes);
  const halfWidth = minutes / 1440;
  const out = [];

  // Term ingress: the local clock offset does not apply, this lives in UT.
  for (const edge of [centre.pillars.period.start, centre.pillars.period.end]) {
    const delta = (edge - centre.time.ut) * 1440;
    if (Math.abs(delta) < minutes) {
      out.push({ offsetMinutes: delta, kind: 'term', label: `${centre.pillars.period.term.name}／${centre.pillars.period.next.name} の節入り` });
    }
  }

  // Local-clock boundaries: convert each candidate hour on the neighbouring
  // days into an offset from the recorded time.
  const local = centre.time.local;
  const shift = local - centre.time.ut;
  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    const date = calendarDate(local + dayOffset);
    for (const hour of HOUR_BOUNDARIES) {
      const boundaryLocal = julianDay(date.year, date.month, date.day, hour);
      if (Math.abs(boundaryLocal - local) > halfWidth + 1e-9) continue;
      const delta = (boundaryLocal - local) * 1440;
      if (Math.abs(delta) >= minutes) continue;
      const kind = hour === 0 || hour === 23 ? 'day' : 'hour';
      const label = hour === 0 ? '日界（地方時の0時）' : `${String(hour).padStart(2, '0')}時（時辰の境）`;
      if (!out.some((b) => Math.abs(b.offsetMinutes - delta) < 1e-6)) {
        out.push({ offsetMinutes: delta, kind, label });
      }
      void shift;
    }
  }

  return out.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
}

/**
 * Resolve the chart against its error bar.
 *
 * Returns one of three states, per spec §2.5:
 *   determinate - no boundary inside the bar; the chart can be stated flatly
 *   boundary    - the bar straddles a boundary; every outcome is returned with
 *                 the share of the window it occupies, so the caller can show
 *                 them side by side as natural frequencies
 *   unknown     - no time was recorded; three pillars, and no invented hour
 */
export function resolveUncertainty(input, axes) {
  const minutes = precisionMinutes(input.precision);

  if (minutes === null) {
    const chart = buildChart(input, axes);
    // With no recorded time the whole day is the window, so a term ingress on
    // that day still has to be surfaced; the hour pillar is simply absent.
    const outcomes = partition(input, axes, 12 * 60);
    return {
      state: 'unknown',
      minutes: null,
      chart,
      outcomes,
      boundaries: candidateBoundaries(input, axes, 12 * 60).filter((b) => b.kind === 'term'),
    };
  }

  const boundaries = candidateBoundaries(input, axes, minutes);
  const chart = buildChart(input, axes);
  if (boundaries.length === 0) {
    return { state: 'determinate', minutes, chart, outcomes: [{ chart, fraction: 1 }], boundaries };
  }

  return { state: 'boundary', minutes, chart, outcomes: partition(input, axes, minutes), boundaries };
}

/**
 * Split the window at its boundaries and evaluate each piece.
 *
 * The width of each piece is the natural frequency the spec asks for: "of the
 * ±30 minute window, two thirds is 庚辰" rather than a bare percentage.
 */
function partition(input, axes, minutes) {
  const boundaries = candidateBoundaries(input, axes, minutes);
  const edges = [-minutes, ...boundaries.map((b) => b.offsetMinutes), minutes];
  const outcomes = [];

  for (let i = 0; i < edges.length - 1; i += 1) {
    const from = edges[i];
    const to = edges[i + 1];
    const width = to - from;
    if (width <= 1e-9) continue;
    const chart = buildChartAtOffset(input, axes, (from + to) / 2);
    const existing = outcomes.find((o) => o.chart.signature === chart.signature);
    if (existing) {
      existing.fraction += width / (2 * minutes);
      existing.spans.push([from, to]);
    } else {
      outcomes.push({ chart, fraction: width / (2 * minutes), spans: [[from, to]] });
    }
  }

  return outcomes.sort((a, b) => b.fraction - a.fraction);
}

/**
 * Render a fraction the way the spec wants it read: as a natural frequency,
 * not a bare percentage.
 */
export function naturalFrequency(fraction) {
  const denominators = [2, 3, 4, 5, 6, 8, 10, 12];
  for (const d of denominators) {
    const n = fraction * d;
    if (Math.abs(n - Math.round(n)) < 0.04 && Math.round(n) >= 1 && Math.round(n) < d) {
      return `${d}分の${Math.round(n)}`;
    }
  }
  return `およそ100分の${Math.round(fraction * 100)}`;
}

/**
 * Chart assembly and the branch axes (spec §4).
 *
 * Schools disagree on three independent choices. Picking one silently is the
 * thing this app exists not to do, but laying all twelve combinations side by
 * side is unreadable. So: compute all twelve, then report only the axes that
 * actually move this particular chart.
 */

import { normaliseTime } from './time.js';
import { computePillars, pillarSignature } from './pillars.js';

export const AXES = [
  {
    key: 'termMethod',
    label: '節入りの決め方',
    options: [
      { value: 'teiki', label: '定気法', note: '実際の太陽黄経' },
      { value: 'kouki', label: '恒気法', note: '冬至から24等分' },
    ],
  },
  {
    key: 'solarTime',
    label: '時刻の補正',
    options: [
      { value: 'apparent', label: '真太陽時', note: '地方時差＋均時差' },
      { value: 'mean', label: '地方時差のみ', note: '均時差を入れない' },
      { value: 'standard', label: '補正なし', note: '標準時のまま' },
    ],
  },
  {
    key: 'ziShi',
    label: '子時の扱い',
    options: [
      { value: 'late', label: '晩子時', note: '23時台は当日' },
      { value: 'early', label: '早子時', note: '23時台は翌日' },
    ],
  },
];

export const DEFAULT_AXES = { termMethod: 'teiki', solarTime: 'apparent', ziShi: 'late' };

/**
 * One chart under one set of axis choices.
 *
 * `precision: 'unknown'` suppresses the hour pillar but does *not* discard the
 * clock: the caller still supplies a representative time (noon), and the error
 * bar sweeps it across the day. Folding the two concerns together — treating
 * "no hour pillar" as "no time at all" — silently freezes that sweep, so a day
 * containing a 節入り stops reporting that the month pillar is undetermined.
 */
export function buildChart(input, axes = DEFAULT_AXES) {
  const hourKnown = input.precision !== 'unknown';
  const time = normaliseTime({
    year: input.year,
    month: input.month,
    day: input.day,
    hour: Number.isFinite(input.hour) ? input.hour : 12,
    minute: Number.isFinite(input.minute) ? input.minute : 0,
    longitude: input.longitude,
    solarTime: axes.solarTime,
  });
  const pillars = computePillars({
    ut: time.ut,
    local: time.local,
    termMethod: axes.termMethod,
    ziShi: axes.ziShi,
    hourKnown,
  });
  return { axes, time, pillars, signature: pillarSignature(pillars) };
}

/** Build a chart at an offset, in minutes, from the recorded time. */
export function buildChartAtOffset(input, axes, offsetMinutes) {
  const minute = (Number.isFinite(input.minute) ? input.minute : 0) + offsetMinutes;
  return buildChart({ ...input, minute }, axes);
}

function cartesian() {
  const combos = [];
  for (const term of AXES[0].options) {
    for (const solar of AXES[1].options) {
      for (const zi of AXES[2].options) {
        combos.push({ termMethod: term.value, solarTime: solar.value, ziShi: zi.value });
      }
    }
  }
  return combos;
}

/** All twelve combinations, always computed, whether or not they are shown. */
export function computeAllVariants(input) {
  return cartesian().map((axes) => buildChart(input, axes));
}

const PILLAR_KEYS = [
  ['year', '年柱'],
  ['month', '月柱'],
  ['day', '日柱'],
  ['hour', '時柱'],
];

function pillarDiff(a, b) {
  const changed = [];
  for (const [key, label] of PILLAR_KEYS) {
    const from = a.pillars[key] ? a.pillars[key].text : '—';
    const to = b.pillars[key] ? b.pillars[key].text : '—';
    if (from !== to) changed.push({ key, label, from, to });
  }
  return changed;
}

/**
 * For each axis: does it move this chart?
 *
 * An axis counts as live if any two of the twelve variants that differ only in
 * that axis produce different pillars. Testing every pairing rather than only
 * the default row means an axis that matters solely in combination with
 * another is still caught.
 */
export function analyseAxes(variants, defaults = DEFAULT_AXES) {
  return AXES.map((axis) => {
    const others = AXES.map((a) => a.key).filter((k) => k !== axis.key);
    const groups = new Map();
    for (const variant of variants) {
      const key = others.map((k) => variant.axes[k]).join('/');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(variant);
    }

    let changes = false;
    for (const group of groups.values()) {
      const signatures = new Set(group.map((v) => v.signature));
      if (signatures.size > 1) changes = true;
    }

    // Show the comparison from the default position, which is what the reader
    // is actually looking at.
    const baseline = variants.find((v) => others.every((k) => v.axes[k] === defaults[k])
      && v.axes[axis.key] === defaults[axis.key]);
    const alternatives = axis.options
      .filter((o) => o.value !== defaults[axis.key])
      .map((option) => {
        const other = variants.find((v) => others.every((k) => v.axes[k] === defaults[k])
          && v.axes[axis.key] === option.value);
        return { option, chart: other, changed: baseline && other ? pillarDiff(baseline, other) : [] };
      });

    return { axis, changes, baseline, alternatives };
  });
}

/**
 * Wiring.
 *
 * Everything runs in the page. Nothing is sent anywhere, nothing is stored —
 * no localStorage, no sessionStorage, no cookies (spec §7). The only network
 * activity in the app's lifetime is fetching the bundled ephemeris at load.
 */

import { initEphemeris, ephemerisVersion, deltaTSeconds, withinEphemeris, EPHEMERIS_YEARS } from './engine/swe.js';
import { buildChart, computeAllVariants, analyseAxes, DEFAULT_AXES } from './engine/chart.js';
import { resolveUncertainty, PRECISIONS, precisionMinutes } from './engine/uncertainty.js';
import {
  el, buildChartElement, updateChartElement, buildStateElement, buildTermElement,
  buildAxesElement, buildBudgetElement, buildBalanceElement, buildDialReadout, signedMinutes,
} from './ui/render.js';
import { buildDial, updateDial } from './ui/dial.js';
import { startSky } from './ui/sky.js';
import { clockHour } from './engine/pillars.js';

const boot = document.getElementById('boot');
const form = document.getElementById('form');
const output = document.getElementById('output');

startSky(document.getElementById('sky'));

const state = {
  precision: 'pm5',
  dial: null,
  readout: null,
  correction: true, // 真太陽時補正 on
  input: null,
  chartRoot: null,
};

/* --- boot ---------------------------------------------------------------- */

try {
  await initEphemeris();
  document.getElementById('swe-version').textContent = ephemerisVersion();
  boot.hidden = true;
  form.hidden = false;
  buildPrecisionChoices();
} catch (error) {
  // Never a blank page: say what failed and what to do about it (§1, §6).
  boot.className = 'boot failed';
  boot.textContent = '';
  boot.append(el('p', 'boot-line', '計算エンジンを読み込めませんでした。'));
  boot.append(el('p', 'remedy',
    'vendor/swisseph-wasm/wasm/ の swisseph.js・swisseph.wasm・swisseph.data が'
    + '揃っているか、ページが file:// ではなく http(s):// で開かれているかを確認してください。'
    + `（${error && error.message ? error.message : '原因不明'}）`));
}

function buildPrecisionChoices() {
  const holder = document.getElementById('precision');
  const hint = document.getElementById('precision-hint');
  for (const option of PRECISIONS) {
    const button = el('button', 'choice', option.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(option.value === state.precision));
    button.addEventListener('click', () => {
      state.precision = option.value;
      for (const other of holder.children) other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      hint.textContent = option.note;
      document.getElementById('birthtime').disabled = option.value === 'unknown';
    });
    holder.append(button);
  }
  hint.textContent = PRECISIONS.find((p) => p.value === state.precision).note;
}

/* --- casting ------------------------------------------------------------- */

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const date = document.getElementById('birthdate').value;
  const time = document.getElementById('birthtime').value;
  if (!date) return;

  const [year, month, day] = date.split('-').map(Number);
  const known = state.precision !== 'unknown';
  const [hour, minute] = known && time ? time.split(':').map(Number) : [12, 0];
  const longitude = Number(document.getElementById('longitude').value);

  if (!withinEphemeris(year)) {
    showError(`同梱の天体暦は西暦 ${EPHEMERIS_YEARS.from} 年から ${EPHEMERIS_YEARS.to} 年までを収めています。`
      + 'この範囲の外は、別の理論で近似した値に切り替わり、見た目には区別がつきません。'
      + '範囲内の日付を入力してください。');
    return;
  }
  if (!Number.isFinite(longitude)) {
    showError('経度が読めません。東経を十進法で入力してください（岩見沢なら 141.79）。');
    return;
  }

  state.input = {
    year, month, day, hour, minute,
    precision: known && !time ? 'unknown' : state.precision,
    longitude,
    latitude: Number(document.getElementById('latitude').value),
  };

  try {
    render();
  } catch (error) {
    // Better a stated failure than a chart that is quietly wrong (§6).
    showError(`命式を立てられませんでした。${error && error.message ? error.message : ''}`);
  }
});

function showError(message) {
  output.hidden = false;
  output.textContent = '';
  downstreamNodes = [];
  output.append(el('p', 'notice', message));
}

function currentAxes() {
  return { ...DEFAULT_AXES, solarTime: state.correction ? 'apparent' : 'standard' };
}

/**
 * What the dial needs: both clocks at once. The gap between them is the whole
 * point of the correction, so neither can be dropped just because one of them
 * is the active chart.
 */
function dialView(input) {
  const axes = currentAxes();
  const chart = buildChart(input, axes);
  const hourKnown = input.precision !== 'unknown';
  return {
    chart,
    hourKnown,
    activeClock: state.correction ? 'apparent' : 'standard',
    apparentHour: hourKnown ? clockHour(buildChart(input, { ...axes, solarTime: 'apparent' }).time.local) : 0,
    standardHour: hourKnown ? clockHour(buildChart(input, { ...axes, solarTime: 'standard' }).time.local) : 0,
    uncertaintyMinutes: precisionMinutes(input.precision),
  };
}

function render() {
  const { input } = state;
  const axes = currentAxes();
  const chart = buildChart(input, axes);

  output.hidden = false;
  output.textContent = '';

  /* --- 天盤 --- */
  const dialSection = el('section', 'section');
  const dialWrap = el('div', 'dial-wrap');
  const view = dialView(input);
  state.dial = buildDial(view);
  dialWrap.append(state.dial);
  dialSection.append(dialWrap);
  state.readout = buildDialReadout(view);
  dialSection.append(state.readout);
  output.append(dialSection);

  /* --- the toggle and the chart (§5.4) --- */
  const toggleSection = el('section', 'section');
  const correction = el('div', 'correction');
  const textWrap = el('div', 'correction-text');
  textWrap.append(el('div', 'correction-title', '真太陽時で立てる'));
  const sub = el('div', 'correction-sub');
  sub.textContent = `地方時差 ${signedMinutes(chart.time.meridianMinutes, 0)} ／ 均時差 ${signedMinutes(chart.time.equationMinutes, 1)}`;
  textWrap.append(sub);
  correction.append(textWrap);

  const toggle = el('button', 'switch');
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(state.correction));
  toggle.setAttribute('aria-label', '真太陽時補正');
  correction.append(toggle);
  toggleSection.append(correction);

  const chartRoot = buildChartElement(chart);
  toggleSection.append(chartRoot);
  state.chartRoot = chartRoot;

  const verdict = el('p', 'verdict');
  toggleSection.append(verdict);
  output.append(toggleSection);

  toggle.addEventListener('click', () => {
    state.correction = !state.correction;
    toggle.setAttribute('aria-pressed', String(state.correction));
    const next = buildChart(input, currentAxes());
    const changed = updateChartElement(state.chartRoot, next);

    sub.textContent = state.correction
      ? `地方時差 ${signedMinutes(next.time.meridianMinutes, 0)} ／ 均時差 ${signedMinutes(next.time.equationMinutes, 1)}`
      : '標準時（東経135度）のまま';

    if (changed.length === 0) {
      // "Nothing moved" is also information, and is shown as such (§5.4).
      verdict.className = 'verdict';
      verdict.textContent = state.correction
        ? '補正しても、柱は変わりませんでした。'
        : '補正を外しても、柱は変わりませんでした。';
    } else {
      verdict.className = 'verdict moved';
      verdict.textContent = '';
      const names = { year: '年柱', month: '月柱', day: '日柱', hour: '時柱' };
      verdict.append(document.createTextNode(
        state.correction ? '実際に生まれた空で立て直すと ' : '標準時で立て直すと '));
      verdict.append(el('span', 'moved-pillar', changed.map((k) => names[k]).join('・')));
      verdict.append(document.createTextNode(' が入れ替わる。'));
    }

    if (state.dial) {
      const nextView = dialView(input);
      updateDial(state.dial, nextView);
      const readout = buildDialReadout(nextView);
      state.readout.replaceWith(readout);
      state.readout = readout;
    }

    // Everything downstream depends on the axis too, so rebuild it.
    try {
      refreshDownstream(input, currentAxes());
    } catch (error) {
      showError(`命式を立て直せませんでした。${error && error.message ? error.message : ''}`);
    }
  });

  refreshDownstream(input, axes);
}

let downstreamNodes = [];

function refreshDownstream(input, axes) {
  for (const node of downstreamNodes) node.remove();
  downstreamNodes = [];

  const chart = buildChart(input, axes);
  const resolution = resolveUncertainty(input, axes);
  const variants = computeAllVariants(input);
  const analysis = analyseAxes(variants, axes);

  const nodes = [
    buildStateElement(resolution),
    buildTermElement(chart),
    buildBalanceElement(chart),
    buildAxesElement(analysis),
    buildBudgetElement(chart, precisionMinutes(input.precision), deltaTSeconds(chart.time.ut)),
    buildTimeNotes(chart),
  ];
  for (const node of nodes) {
    output.append(node);
    downstreamNodes.push(node);
  }
}

/** The two clocks, stated plainly, so the §2.1 split is visible not implied. */
function buildTimeNotes(chart) {
  const section = el('section', 'section');
  section.append(el('h2', null, '使った時刻'));

  const table = el('table');
  const body = el('tbody');
  const rows = [
    ['年柱・月柱の判定', 'UT（補正しない）'],
    ['日柱・時柱の判定', chart.axes.solarTime === 'apparent' ? '真太陽時'
      : chart.axes.solarTime === 'mean' ? '地方平均時' : '標準時'],
    ['標準時オフセット', `UTC+${chart.time.offsetHours}`],
  ];
  if (chart.time.daylightSaving) {
    rows.push(['サマータイム', '1948〜1951年の夏時刻（+1時間）を適用']);
  }
  if (chart.pillars.zishiApplied) {
    rows.push(['子時の扱い', '早子時により日柱を翌日に送り、時干も連動']);
  }
  for (const [label, value] of rows) {
    const tr = el('tr');
    tr.append(el('th', null, label));
    tr.append(el('td', 'num', value));
    body.append(tr);
  }
  table.append(body);
  section.append(table);

  if (chart.time.ambiguous) {
    section.append(el('p', 'hint',
      'この時刻はサマータイム終了時に二度あります。どちらかは記録からは決まりません。'));
  }
  section.append(el('p', 'hint',
    '節入りは地球上どこでも同じ瞬間に起きるため、年柱と月柱には地方時の補正を掛けていません。'
    + '掛けると、この経度では27分ぶん狂います。'));
  return section;
}

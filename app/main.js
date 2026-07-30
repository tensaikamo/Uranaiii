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
  buildAxesElement, buildBudgetElement, buildBalanceElement, buildReadingElement, buildDialReadout, buildInspectLine, writeInspect,
  formatJst, signedMinutes,
} from './ui/render.js';
import { buildDial, updateDial } from './ui/dial.js';
import { startSky } from './ui/sky.js';
import { clockHour } from './engine/pillars.js';
import { japanNow } from './engine/time.js';
import { attachPlaceField } from './ui/placefield.js';

const boot = document.getElementById('boot');
const form = document.getElementById('form');
const output = document.getElementById('output');

startSky(document.getElementById('sky'));

// 生まれた場所から経度を引く。表は同梱なので、通信は発生しない。
attachPlaceField();

const state = {
  precision: 'pm5',
  dial: null,
  readout: null,
  inspect: null,
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
  if (isFuture(year, month, day)) {
    showError('生年月日が未来になっています。1929年を2029年と打ち間違えていませんか。');
    return;
  }

  state.input = {
    year, month, day, hour, minute,
    precision: known && !time ? 'unknown' : state.precision,
    longitude,
  };

  try {
    render();
  } catch (error) {
    // Better a stated failure than a chart that is quietly wrong (§6) — but the
    // failure has to be readable. A raw JS message ("Cannot read properties of
    // undefined") in the middle of a Japanese page tells the reader nothing, so
    // it goes to the console and the page gets a sentence.
    console.error(error);
    showError('命式を立てられませんでした。入力を確かめてもう一度試してください。'
      + '同じところで止まる場合は、原因の詳細がブラウザのコンソールに出ています。');
  }
});

/**
 * Is this date still ahead of us, in Japan?
 *
 * A birth that has not happened yet gives a negative age, which silently drops
 * the 大運 row out of the timeline while every other row still renders — so the
 * page looks fine and means nothing. Mistyping 1929 as 2029 is an ordinary slip.
 */
function isFuture(year, month, day) {
  const today = japanNow();
  return Date.UTC(year, month - 1, day) > Date.UTC(today.year, today.month - 1, today.day);
}

/** Stop the date picker offering days that have not happened. */
function capBirthdateAtToday() {
  const t = japanNow();
  const iso = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const field = document.getElementById('birthdate');
  if (field && (!field.max || field.max > iso)) field.max = iso;
}
capBirthdateAtToday();

/**
 * Tell the reader when this page and the 語り page have diverged.
 *
 * Appended to the footer link rather than shown as a warning: nothing is wrong,
 * the two pages are answering with different axis choices, and that is exactly
 * what the toggle is for.
 */
function noteVoiceDivergence(correctionOn) {
  const link = document.querySelector('footer a[href="voice.html"]');
  if (!link) return;
  const existing = document.getElementById('voice-divergence');
  if (correctionOn) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const note = el('span', 'diverge', '　※ いま真太陽時補正を切っています。'
    + '語りのページは補正ありで読むので、命式そのものが違って出ることがあります。');
  note.id = 'voice-divergence';
  link.parentElement.append(note);
}

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
    formatTime: (jd) => formatJst(jd),
    onInspect: (detail) => { if (state.inspect) writeInspect(state.inspect, detail); },
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
  state.inspect = buildInspectLine();
  state.dial = buildDial({ ...view, animateIn: true });
  dialWrap.append(state.dial);
  dialSection.append(dialWrap);
  state.readout = buildDialReadout(view);
  dialSection.append(state.readout);
  dialSection.append(state.inspect);
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
    // The 語り page always reads with the correction on. Turning it off here
    // means the two pages are looking at different boards — measured over 4,000
    // charts, 40.9% of them differ, 8.5% reach a different 身強身弱 verdict and
    // 11.7% a different 用神. Saying so is the same disclosure §4.1 asks for on
    // any other axis.
    noteVoiceDivergence(state.correction);
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
    buildReadingElement(chart),
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

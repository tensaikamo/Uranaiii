/**
 * Wiring for the 託宣 page.
 *
 * The reading arrives a line at a time. That is not decoration: a reading is
 * spoken, and speech has pacing. Delivered all at once it becomes a block of
 * text to skim, which is what the other two pages already are — and being
 * skimmable is exactly what this page is not for.
 *
 * The pacing carries no information. Under `prefers-reduced-motion` every line
 * is present immediately, and nothing is lost but the timing.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS, julianDay } from './engine/swe.js';
import { buildChart, DEFAULT_AXES } from './engine/chart.js';
import { judgeBoth, yearFit } from './engine/strength.js';
import { luckPeriods, cycleAtAge, ageExact } from './engine/luck.js';
import { oracle } from './engine/oracle.js';
import { headline } from './engine/glance.js';
import { frequencyOf, RARITY_SAMPLES } from './engine/rarity.js';
import { peopleIn } from './engine/plainwords.js';
import { japanNow } from './engine/time.js';
import { attachPlaceField } from './ui/placefield.js';
import { el } from './ui/render.js';
import { startSky } from './ui/sky.js';

startSky(document.getElementById('sky'));

// 生まれた場所から経度を引く。表は同梱なので、通信は発生しない。
attachPlaceField();

const boot = document.getElementById('boot');
const form = document.getElementById('form');
const output = document.getElementById('output');

const state = { sex: null };

{
  const holder = document.getElementById('sex');
  for (const [value, label] of [['male', '男性'], ['female', '女性'], [null, '答えない']]) {
    const button = el('button', 'choice', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.sex === value));
    button.addEventListener('click', () => {
      state.sex = value;
      for (const other of holder.children) other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
    });
    holder.append(button);
  }
}

try {
  await initEphemeris();
  boot.hidden = true;
  form.hidden = false;
} catch (error) {
  boot.className = 'boot failed';
  boot.textContent = '';
  boot.append(el('p', 'boot-line', '計算エンジンを読み込めませんでした。'));
  boot.append(el('p', 'remedy',
    'vendor/swisseph-wasm/wasm/ の3ファイルが揃っているか、ページが file:// ではなく '
    + `http(s):// で開かれているかを確認してください。（${error && error.message ? error.message : '原因不明'}）`));
}

// Stop the date picker offering days that have not happened.
{
  const t = japanNow();
  const iso = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const field = document.getElementById('birthdate');
  if (field && (!field.max || field.max > iso)) field.max = iso;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const date = document.getElementById('birthdate').value;
  const time = document.getElementById('birthtime').value;
  if (!date) return;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time ? time.split(':').map(Number) : [12, 0];

  output.hidden = false;
  output.textContent = '';

  if (!withinEphemeris(year)) {
    output.append(el('p', 'notice',
      `使っている天体暦は西暦 ${EPHEMERIS_YEARS.from} 年から ${EPHEMERIS_YEARS.to} 年までです。`));
    return;
  }
  {
    const t = japanNow();
    if (Date.UTC(year, month - 1, day) > Date.UTC(t.year, t.month - 1, t.day)) {
      output.append(el('p', 'notice', '生年月日が未来になっています。'));
      return;
    }
  }

  try {
    render({
      sex: state.sex,
      year, month, day, hour, minute,
      precision: time ? 'pm5' : 'unknown',
      longitude: Number(document.getElementById('longitude').value),
    });
  } catch (error) {
    console.error(error);
    output.append(el('p', 'notice', '託を読めませんでした。入力を確かめてもう一度。'));
  }
});

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function render(input) {
  const chart = buildChart(input, DEFAULT_AXES);
  const strength = judgeBoth(chart.pillars);

  const now = new Date();
  const nowJdUt = julianDay(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours() + now.getUTCMinutes() / 60,
  );
  const luck = luckPeriods(chart, strength, input.sex);
  const cycle = luck ? cycleAtAge(luck, ageExact(input, now)) : null;

  // The year in progress, so the oracle can speak of the wind even when no sex
  // was given and there is no 大運 to stand in.
  const nowChart = buildChart({ ...japanNow(now), precision: 'pm5', longitude: input.longitude }, DEFAULT_AXES);

  const reading = oracle(chart, strength, {
    luckFit: cycle ? cycle.fit : null,
    yearFit: yearFit(strength, nowChart.pillars.year.stemElement),
  });

  const scroll = el('article', 'scroll');

  // The eight characters, small and unexplained. On this page the board is not
  // evidence to be checked; it is the object the words came out of.
  const seal = el('p', 'seal');
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = chart.pillars[key];
    seal.append(el('span', 'seal-pillar', p ? p.text : '—'));
  }
  scroll.append(seal);

  // The naming, before the telling.
  //
  // 託宣 already speaks in one register and the ◎○△ table would break it — a
  // symbol grid is a different kind of object from a spoken reading. The
  // headline is not: naming a thing before pronouncing on it is what an oracle
  // does. So this page takes the one line and none of the rest.
  {
    const head = headline(chart, strength);
    if (head) {
      const naming = el('p', 'seal-name');
      naming.append(el('span', 'seal-phrase', head.phrase));
      naming.append(el('span', 'seal-type', head.type));
      scroll.append(naming);
    }
  }

  const instant = reducedMotion();
  let step = 0;
  for (const m of reading.movements) {
    const block = el(m.kind === 'title' ? 'h2' : 'p', `oracle-line is-${m.kind}`);
    for (const [i, part] of m.text.split('\n').entries()) {
      if (i > 0) block.append(el('br'));
      block.append(document.createTextNode(part));
    }
    if (!instant) {
      block.style.animationDelay = `${240 + step * 620}ms`;
      block.classList.add('is-timed');
      step += 1;
    }
    scroll.append(block);
  }

  output.append(scroll);

  // The machinery, kept and folded. A reader who wants to take the reading apart
  // still can; a reader who wants to be spoken to is not made to walk past it.
  const proof = el('details', 'gloss proof');
  proof.append(el('summary', 'gloss-summary', 'この託宣が出てきた根拠'));
  proof.append(el('p', 'hint',
    `八字は ${['year', 'month', 'day', 'hour'].map((k) => (chart.pillars[k] ? chart.pillars[k].text : '—')).join('・')}。`
    + `判定は${strength.label}（${strength.score}）。効く五行は ${strength.needed.map((e) => ({ wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[e])).join('と')}。`));
  const list = el('ul', 'proof-list');
  for (const m of reading.movements) {
    const item = el('li', 'proof-item');
    item.append(el('p', 'proof-text', m.text.replace(/\n/g, ' ')));
    const cites = el('p', 'reading-source');
    const share = peopleIn(frequencyOf(m.key), RARITY_SAMPLES);
    if (share) cites.append(el('span', 'cite is-freq', share));
    for (const src of m.source) cites.append(el('span', 'cite', src));
    item.append(cites);
    list.append(item);
  }
  proof.append(list);
  proof.append(el('p', 'hint',
    '八字から言葉への飛躍は、計算ではなく昔からの解釈です。そこは検算できません。'
    + '検算できるところは全部、盤のページに出しています。'));
  output.append(proof);
}

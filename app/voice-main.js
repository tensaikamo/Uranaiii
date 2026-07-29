/**
 * Wiring for the 語り page.
 *
 * Same engine, same zero-network guarantee. What differs is the register, and
 * the page says so at the top rather than letting the reader assume otherwise.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS, julianDay } from './engine/swe.js';
import { buildChart, DEFAULT_AXES } from './engine/chart.js';
import { speak } from './engine/voice.js';
import { describeFrequency } from './engine/reading.js';
import { frequencyOf } from './engine/rarity.js';
import { el } from './ui/render.js';
import { startSky } from './ui/sky.js';

startSky(document.getElementById('sky'));

const boot = document.getElementById('boot');
const form = document.getElementById('form');
const output = document.getElementById('output');

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
      `同梱の天体暦は西暦 ${EPHEMERIS_YEARS.from} 年から ${EPHEMERIS_YEARS.to} 年まで。`
      + '範囲内の日付を入力してください。'));
    return;
  }

  try {
    render({
      year, month, day, hour, minute,
      precision: time ? 'pm5' : 'unknown',
      longitude: Number(document.getElementById('longitude').value),
      latitude: Number(document.getElementById('latitude').value),
    });
  } catch (error) {
    output.append(el('p', 'notice',
      `読めませんでした。${error && error.message ? error.message : ''}`));
  }
});

/** One passage: the prose, how common it is, and what it came from. */
function passage(entry, { lead = false } = {}) {
  const item = el('div', `voice-item${lead ? ' is-lead' : ''}`);
  if (entry.title) item.append(el('p', 'voice-title', entry.title));
  item.append(el('p', 'voice-text', entry.text));

  // The same measured rarity the board page uses. On this page it does more
  // work: it is the reader's defence against a passage that feels uncannily
  // personal simply because it is true of a third of everybody.
  const frequency = describeFrequency(frequencyOf(entry.key));
  const cites = el('p', 'reading-source');
  if (frequency) {
    const chip = el('span', 'cite is-freq', frequency);
    cites.append(chip);
  }
  for (const src of entry.source) cites.append(el('span', 'cite', src));
  item.append(cites);
  return item;
}

function block(title, entries) {
  if (!entries || entries.length === 0) return null;
  const section = el('section', 'section');
  section.append(el('h2', null, title));
  for (const entry of entries) section.append(passage(entry));
  return section;
}

function render(input) {
  const chart = buildChart(input, DEFAULT_AXES);
  const now = new Date();
  const nowJdUt = julianDay(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours() + now.getUTCMinutes() / 60,
  );
  const v = speak(chart, nowJdUt);

  // The board itself, small, so the reader can always see what is being read.
  const strip = el('div', 'voice-strip');
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = chart.pillars[key];
    const cell = el('div', 'voice-cell');
    cell.append(el('span', 'voice-cell-label', label));
    cell.append(el('span', 'voice-cell-text', p ? p.text : '—'));
    strip.append(cell);
  }
  output.append(strip);

  const portrait = el('section', 'section');
  portrait.append(el('h2', null, '日主'));
  portrait.append(passage(v.portrait, { lead: true }));
  portrait.append(passage(v.season));
  output.append(portrait);

  for (const [title, entries] of [
    ['五行から', v.tendencies],
    ['柱の関係', v.relations],
    ['今年', [v.year]],
    ['助言', v.advice],
  ]) {
    const node = block(title, entries);
    if (node) output.append(node);
  }

  const close = el('section', 'section');
  close.append(el('h2', null, 'この読みについて'));
  close.append(el('p', 'hint',
    'ここに書いたものは全て、上の八字のどれかから引いている。出典は各文に付けてある。'
    + 'ただし「盤にこう出ている」と「だからこの人はこうだ」のあいだには飛躍がある。'
    + 'その飛躍こそが伝統の読みであり、検算できない部分でもある。'));
  close.append(el('p', 'hint',
    '当たっていると感じたら、その文の「およそN件に1件」を見てほしい。'
    + '3件に1件の配置なら、同じ文が世の中の3分の1に当たっている。'));
  const back = el('p', 'hint');
  const link = el('a', null, '検算できる盤のほうへ →');
  link.href = 'index.html';
  back.append(link);
  close.append(back);
  output.append(close);
}

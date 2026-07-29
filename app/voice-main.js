/**
 * Wiring for the 語り page.
 *
 * The page is laid out the way a reading is delivered, which is the opposite of
 * how the first draft was laid out:
 *
 *   名前 → 結論 → なぜ → どういう人か → 今年 → どうするか
 *
 * The name comes first because that is what a reader keeps. The verdict comes
 * second because everything below it hangs off that one judgement. The
 * arithmetic behind the verdict is shown, but folded away — available to anyone
 * who wants to argue with it, out of the way of everyone who does not.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS, julianDay } from './engine/swe.js';
import { buildChart, DEFAULT_AXES } from './engine/chart.js';
import { speak } from './engine/voice.js';
import { describeFrequency } from './engine/reading.js';
import { frequencyOf, RARITY_SAMPLES } from './engine/rarity.js';
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
      `同梱の天体暦は西暦 ${EPHEMERIS_YEARS.from} 年から ${EPHEMERIS_YEARS.to} 年まで。範囲内の日付を入力してください。`));
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
    output.append(el('p', 'notice', `読めませんでした。${error && error.message ? error.message : ''}`));
  }
});

/** The measured frequency chip, in natural frequency. */
function frequencyChip(key) {
  const frequency = describeFrequency(frequencyOf(key));
  return frequency ? el('span', 'cite is-freq', frequency) : null;
}

function citations(entry) {
  const cites = el('p', 'reading-source');
  const chip = frequencyChip(entry.key);
  if (chip) cites.append(chip);
  for (const src of entry.source) cites.append(el('span', 'cite', src));
  return cites;
}

/** One prose passage: title, body, frequency, sources. */
function passage(entry) {
  const item = el('div', 'voice-item');
  if (entry.title) item.append(el('p', 'voice-title', entry.title));
  item.append(el('p', 'voice-text', entry.text));
  item.append(citations(entry));
  return item;
}

function block(title, entries) {
  const present = (entries || []).filter(Boolean);
  if (present.length === 0) return null;
  const section = el('section', 'section');
  section.append(el('h2', null, title));
  for (const entry of present) section.append(passage(entry));
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
  const s = v.strength;

  /* --- 名前 — what the reader leaves with ------------------------------- */
  const hero = el('div', 'hero');
  hero.append(el('p', 'hero-eyebrow', 'あなたは'));
  hero.append(el('p', 'hero-name', v.type.name));

  const verdictRow = el('p', 'hero-verdict');
  verdictRow.append(el('span', `hero-badge is-${s.verdict}`, s.label));
  verdictRow.append(el('span', 'hero-need', v.verdict.lead));
  hero.append(verdictRow);

  const heroFreq = describeFrequency(frequencyOf(v.type.key));
  if (heroFreq) {
    hero.append(el('p', 'hero-freq',
      `この型は ${heroFreq}（${RARITY_SAMPLES.toLocaleString('ja-JP')}件の実測。季節×十干で40通り）`));
  }
  output.append(hero);

  /* --- the board itself, small, so the reading is never floating --------- */
  const strip = el('div', 'voice-strip');
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = chart.pillars[key];
    const cell = el('div', 'voice-cell');
    cell.append(el('span', 'voice-cell-label', label));
    cell.append(el('span', 'voice-cell-text', p ? p.text : '—'));
    strip.append(cell);
  }
  output.append(strip);

  /* --- 結論 -------------------------------------------------------------- */
  const verdictSection = el('section', 'section');
  verdictSection.append(el('h2', null, '結論'));
  verdictSection.append(passage(v.verdict));

  // The arithmetic, folded away. Anyone who wants to disagree can see exactly
  // where to disagree; anyone who does not is not made to read it.
  const why = el('details', 'gloss');
  why.append(el('summary', 'gloss-summary',
    `なぜ${s.label}と出たか（点数 ${s.score > 0 ? '+' : ''}${s.score}）`));
  const table = el('table');
  const body = el('tbody');
  for (const line of s.lines) {
    const tr = el('tr');
    tr.append(el('th', null, line.label));
    tr.append(el('td', null, line.detail));
    tr.append(el('td', 'num', `${line.score > 0 ? '+' : ''}${line.score}`));
    body.append(tr);
  }
  const total = el('tr', 'dominant');
  total.append(el('th', null, '合計'));
  total.append(el('td', null, `±${s.band} の内なら中庸`));
  total.append(el('td', 'num', `${s.score > 0 ? '+' : ''}${s.score}`));
  body.append(total);
  table.append(body);
  why.append(table);
  why.append(el('p', 'hint',
    `扶抑法による。月令を3倍に見て、残りの七字を1倍で足し引きし、地支に日主と同じ五行があれば通根として +1。`
    + `境界（±${s.band}）からの余裕は ${s.margin}。`
    + (s.margin < 1 ? '境界に近いので、流派や蔵干の扱いで逆の判定になりうる。' : '')
    + '蔵干は v1 対象外なので、地支は表に出ている五行だけで数えている。'));
  verdictSection.append(why);
  output.append(verdictSection);

  /* --- the rest, in delivery order -------------------------------------- */
  for (const [title, entries] of [
    ['用神 — 何に寄せるか', [v.need]],
    ['日主', [v.portrait]],
    ['欠けているもの', [v.absence]],
    ['今年', [v.year]],
    ['どうするか', v.advice],
  ]) {
    const node = block(title, entries);
    if (node) output.append(node);
  }

  /* --- honesty about the register --------------------------------------- */
  const close = el('section', 'section');
  close.append(el('h2', null, 'この読みについて'));
  close.append(el('p', 'hint',
    'ここに書いたものは全て、上の八字から引いている。出典は各文に付けてある。'
    + 'ただし「盤にこう出ている」と「だからこの人はこうだ」のあいだには飛躍がある。'
    + 'その飛躍こそが伝統の読みであり、検算できない部分でもある。'));
  close.append(el('p', 'hint',
    `当たっていると感じたら、その文の「およそN件に1件」を見てほしい。`
    + `3件に1件の配置なら、同じ文が世の中の3分の1に当たっている。`
    + `頻度は ${RARITY_SAMPLES.toLocaleString('ja-JP')} 件のランダムな命式から実測したもので、`
    + `「統計に基づく」と言うだけで数字を出さない、ということはしていない。`));
  const back = el('p', 'hint');
  const link = el('a', null, '検算できる盤のほうへ →');
  link.href = 'index.html';
  back.append(link);
  close.append(back);
  output.append(close);
}

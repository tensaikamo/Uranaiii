/**
 * Wiring for the 語り page.
 *
 * Laid out the way a reading is delivered:
 *   名前 → 結論 → なぜ → どんな人か → 今年 → どうするか
 *
 * The name comes first because that is what a reader keeps. Everything below
 * hangs off the one verdict. The arithmetic behind the verdict is available but
 * folded away — there for anyone who wants to argue with it, out of the way of
 * everyone who does not.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS, julianDay } from './engine/swe.js';
import { buildChart, DEFAULT_AXES } from './engine/chart.js';
import { speak } from './engine/voice.js';
import { peopleIn, ELEMENT_PLAIN } from './engine/plainwords.js';
import { readName } from './engine/name.js';
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
      `使っている天体暦は西暦 ${EPHEMERIS_YEARS.from} 年から ${EPHEMERIS_YEARS.to} 年までです。この範囲の日付を入れてください。`));
    return;
  }

  try {
    render({
      surname: document.getElementById('surname').value,
      given: document.getElementById('given').value,
      year, month, day, hour, minute,
      precision: time ? 'pm5' : 'unknown',
      longitude: Number(document.getElementById('longitude').value),
      latitude: Number(document.getElementById('latitude').value),
    });
  } catch (error) {
    output.append(el('p', 'notice', `読めませんでした。${error && error.message ? error.message : ''}`));
  }
});

/**
 * Body text into paragraphs, with **emphasis** honoured.
 * Built with createTextNode throughout — the text is ours, but the habit of
 * never assembling DOM from strings is worth keeping.
 */
function prose(text, className) {
  const wrap = el('div', className);
  for (const para of String(text).split('\n\n')) {
    const p = el('p', 'voice-text');
    for (const [i, chunk] of para.split('**').entries()) {
      if (chunk === '') continue;
      if (i % 2 === 1) p.append(el('strong', 'voice-strong', chunk));
      else p.append(document.createTextNode(chunk));
    }
    wrap.append(p);
  }
  return wrap;
}

function citations(entry) {
  const cites = el('p', 'reading-source');
  const share = peopleIn(frequencyOf(entry.key));
  if (share) cites.append(el('span', 'cite is-freq', share));
  if (entry.term) cites.append(el('span', 'cite is-term', entry.term));
  for (const src of entry.source) cites.append(el('span', 'cite', src));
  return cites;
}

/** One passage, rendered as its own titled card. */
function passage(entry) {
  const section = el('section', 'section');
  section.append(el('h2', 'plain-h2', entry.title));
  if (entry.lead) section.append(el('p', 'voice-lead', entry.lead));
  section.append(prose(entry.text));
  section.append(citations(entry));
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

  /* --- 名前 --- */
  const hero = el('div', 'hero');
  hero.append(el('p', 'hero-eyebrow', 'あなたは'));
  hero.append(el('p', 'hero-name', v.type.name));
  hero.append(el('p', 'hero-tag', v.type.tag));

  const row = el('p', 'hero-verdict');
  row.append(el('span', `hero-badge is-${s.verdict}`, v.verdict.title));
  row.append(el('span', 'hero-need',
    `効くのは ${s.needed.map((e) => ({ wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[e])).join('と')}`));
  hero.append(row);

  const share = peopleIn(frequencyOf(v.type.key));
  if (share) {
    hero.append(el('p', 'hero-freq',
      `このタイプは ${share}（${RARITY_SAMPLES.toLocaleString('ja-JP')}人ぶんを実際に数えた結果。全40タイプ）`));
  }
  output.append(hero);

  /* --- the board, small --- */
  const strip = el('div', 'voice-strip');
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = chart.pillars[key];
    const cell = el('div', 'voice-cell');
    cell.append(el('span', 'voice-cell-label', label));
    cell.append(el('span', 'voice-cell-text', p ? p.text : '—'));
    strip.append(cell);
  }
  output.append(strip);

  /* --- 結論 + なぜ --- */
  const verdictSection = passage(v.verdict);
  const why = el('details', 'gloss');
  why.append(el('summary', 'gloss-summary', 'なぜそう言えるの？（計算の中身）'));
  why.append(el('p', 'hint',
    '生年月日時から出た8文字それぞれについて、あなたの本体を「助けるほう」か「削るほう」かを数えています。'
    + '生まれた月はいちばん効くので3倍で数えます。'));
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
  total.append(el('td', null, `−${s.band}〜+${s.band} ならバランス型`));
  total.append(el('td', 'num', `${s.score > 0 ? '+' : ''}${s.score}`));
  body.append(total);
  table.append(body);
  why.append(table);
  why.append(el('p', 'hint',
    (s.margin < 1
      ? '※ 境目にかなり近い結果です。流派によっては逆の判定になります。'
      : '※ 境目からは離れているので、この判定は動きにくいほうです。')
    + '地支の「隠れた干（蔵干）」までは数えていません。そこまで見る流派では、結果が変わることがあります。'));
  verdictSection.append(why);
  output.append(verdictSection);

  /* --- the rest --- */
  for (const entry of [v.need, v.portrait, v.absence, v.year]) {
    if (entry) output.append(passage(entry));
  }

  /* --- 姓名判断, when a name was given ---------------------------------- */
  // Two different systems, joined only where they legitimately meet: both
  // speak 五行, and the chart has already said which one is needed.
  const named = readName(input.surname || '', input.given || '', s);
  if (named) {
    const section = el('section', 'section');
    section.append(el('h2', 'plain-h2', '名前から'));

    const table = el('table');
    const tbody = el('tbody');
    for (const g of named.five.grids) {
      const tr = el('tr', named.supplies.includes(g) ? 'dominant' : null);
      tr.append(el('th', null, g.name));
      tr.append(el('td', 'num', `${g.count}画`));
      tr.append(el('td', null,
        `${ELEMENT_PLAIN[g.element].name}${named.supplies.includes(g) ? '　← 効く' : ''}`));
      tbody.append(tr);
    }
    table.append(tbody);
    section.append(table);
    section.append(prose(named.text));

    if (named.five.unknown.length > 0) {
      section.append(el('p', 'hint',
        `画数が分からない文字がありました: ${named.five.unknown.join('、')}。`
        + 'その字を抜いて数えているので、結果はずれています。'));
    }
    section.append(el('p', 'hint',
      '画数は漢字辞典の数え方（新字体）です。旧字体で数える流派では、'
      + '邊や齋のような字で結果が変わります。'
      + 'また「総格◯画は吉」という81画の吉凶表は、流派差が大きいので入れていません。'));
    section.append(citations(named));
    output.append(section);
  }

  for (const entry of v.advice) output.append(passage(entry));

  /* --- honesty, also in plain words --- */
  const close = el('section', 'section');
  close.append(el('h2', 'plain-h2', 'この結果の読み方'));
  close.append(el('p', 'hint',
    'ここに書いたことは全部、上の8文字から計算して出しています。'
    + '各文の下にある小さいタグが、その文の根拠です。'));
  close.append(el('p', 'hint',
    'ただし「8文字がこうなっている」から「だからこういう人です」への飛躍は、'
    + '計算ではなく昔からの解釈です。ここは検算できません。'));
  close.append(el('p', 'hint',
    `当たっていると感じたら、その文の「◯人に1人」を見てください。`
    + `3人に1人と書いてあれば、同じ文が世の中の3分の1に当たっています。`
    + `この数字は ${RARITY_SAMPLES.toLocaleString('ja-JP')} 人ぶんを実際に数えて出したもので、`
    + `「統計に基づく」と言うだけで数字を出さない、ということはしていません。`));
  const back = el('p', 'hint');
  const link = el('a', null, '計算の中身が見えるページへ →');
  link.href = 'index.html';
  back.append(link);
  close.append(back);
  output.append(close);
}

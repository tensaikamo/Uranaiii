/**
 * Wiring for the 語り page.
 *
 * Laid out so the page can be *scanned* before it is read:
 *   名前 → 命式 → 目盛り4本 → 強み・つまずき・今すぐ → 場面ごと → 時の流れ → 長文
 *
 * The earlier version was nine essays stacked vertically, and a reader had to
 * finish them to find out what they had been told. Everything above the fold is
 * now a bar or a one-line bullet; the essays are still here, in full, behind
 * each section's もっと読む. Same conclusions, same sources — reachable in a
 * glance instead of in five minutes.
 *
 * The arithmetic stays available too, folded, for anyone who wants to argue
 * with it, and out of the way of everyone who does not.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS, julianDay } from './engine/swe.js';
import { buildChart, DEFAULT_AXES } from './engine/chart.js';
import { speak } from './engine/voice.js';
import { peopleIn, ELEMENT_PLAIN } from './engine/plainwords.js';
import { readName } from './engine/name.js';
import { hiddenStems } from './engine/hidden.js';
import { gauges, dayStemInDoubt } from './engine/gauges.js';
import { resolveUncertainty } from './engine/uncertainty.js';
import { domainBullets, needAbsentNote, summaryCards, DOMAINS } from './engine/domains.js';
import { FIT_LABEL } from './engine/timeline.js';
import { frequencyOf, RARITY_SAMPLES } from './engine/rarity.js';
import { el } from './ui/render.js';
import { startSky } from './ui/sky.js';
import { japanNow } from './engine/time.js';

startSky(document.getElementById('sky'));

const boot = document.getElementById('boot');
const form = document.getElementById('form');
const output = document.getElementById('output');

const state = { sex: null };

// 性別 is a parameter of the 大運 rule, not a claim about the reader, so it is
// asked for in those terms and can be declined without losing the rest.
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
  // A birth that has not happened yet gives a negative age. The 大運 row then
  // vanishes from the timeline while every other row still renders, so the page
  // looks complete and means nothing. 1929 mistyped as 2029 is an ordinary slip.
  {
    const t = japanNow();
    if (Date.UTC(year, month - 1, day) > Date.UTC(t.year, t.month - 1, t.day)) {
      output.append(el('p', 'notice',
        '生年月日が未来になっています。1929年を2029年と打ち間違えていませんか。'));
      return;
    }
  }

  try {
    render({
      sex: state.sex,
      surname: document.getElementById('surname').value,
      given: document.getElementById('given').value,
      year, month, day, hour, minute,
      precision: time ? 'pm5' : 'unknown',
      longitude: Number(document.getElementById('longitude').value),
    });
  } catch (error) {
    // The reader gets a sentence; the stack goes to the console. A raw
    // "Cannot read properties of undefined" in a Japanese page helps nobody.
    console.error(error);
    output.append(el('p', 'notice',
      '占えませんでした。入力を確かめてもう一度試してください。'
      + '同じところで止まる場合は、原因の詳細がブラウザのコンソールに出ています。'));
  }
});

// Stop the date picker offering days that have not happened.
{
  const t = japanNow();
  const iso = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const field = document.getElementById('birthdate');
  if (field && (!field.max || field.max > iso)) field.max = iso;
}

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

/**
 * One passage, rendered as its own titled card.
 *
 * `fold` puts the prose behind a "もっと読む" disclosure instead of showing it
 * outright. The bullets and the bar above a section are the part a reader
 * actually scans; the paragraphs are for whoever wants them. Nothing is deleted
 * by folding — it is one tap away.
 */
function passage(entry, { fold = false, bullets = null } = {}) {
  const section = el('section', 'section');
  section.append(el('h2', 'plain-h2', entry.title));
  if (entry.lead) section.append(el('p', 'voice-lead', entry.lead));
  if (bullets) section.append(bulletList(bullets));

  if (fold) {
    const more = el('details', 'gloss');
    more.append(el('summary', 'gloss-summary', 'もっと読む'));
    more.append(prose(entry.text));
    more.append(citations(entry));
    section.append(more);
  } else {
    section.append(prose(entry.text));
    section.append(citations(entry));
  }
  return section;
}

/** Short lines, each with the characters it came from. */
function bulletList(bullets) {
  const list = el('ul', 'bullets');
  for (const b of bullets) {
    const item = el('li', 'bullet');
    item.append(el('p', 'bullet-text', b.text));
    item.append(citations(b));
    list.append(item);
  }
  return list;
}

/**
 * One gauge: two poles, and where this chart sits between them.
 *
 * `percent` is always distance toward the left pole (see gauges.js). The colour
 * fills from whichever pole the chart leans toward, so the picture and the words
 * under it never disagree. Marked up as a meter, so a screen reader gets the
 * position rather than a decorative div.
 */
function gaugeRow(g) {
  const row = el('div', `gauge${g.verdict ? ` is-${g.verdict}` : ''}`);

  const poles = el('div', 'gauge-poles');
  poles.append(el('span', 'gauge-pole', `${g.left} ${g.percent}%`));
  poles.append(el('span', 'gauge-name', g.title));
  poles.append(el('span', 'gauge-pole is-right',
    `${Number((100 - g.percent).toFixed(1))}% ${g.right}`));
  row.append(poles);

  const track = el('div', 'gauge-track');
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(g.percent));
  track.setAttribute('aria-label',
    `${g.title}。${g.left} ${g.percent}パーセント、${g.right} ${Number((100 - g.percent).toFixed(1))}パーセント。${g.reading}`);

  // Fill from whichever end the chart actually leans toward, not always from the
  // left. Filling leftward for a 身弱 chart drew colour across 「力が余る」 while
  // the label underneath said 削られる — the picture contradicted the words. And
  // a gauge at 0% left an empty track, which reads as missing data rather than as
  // "fully the right-hand pole".
  const leansLeft = g.percent >= 50;
  const fill = el('div', `gauge-fill${leansLeft ? '' : ' is-right'}`);
  fill.style.width = `${leansLeft ? g.percent : 100 - g.percent}%`;
  track.append(fill);

  // Reference marks go on *top* of the fill. Drawn underneath, the fill covered
  // them — and the 中庸 band is exactly the mark a reader needs when the fill has
  // reached it.
  //
  // 中庸 is a zone rather than a line: a chart at 0.9 and one at 7 are different
  // claims, and a single midpoint tick would hide that.
  if (g.band) {
    const band = el('div', 'gauge-band');
    band.style.left = `${50 - g.band}%`;
    band.style.width = `${g.band * 2}%`;
    track.append(band);
  }
  // Where the bar would sit if the five elements were as level as this many
  // characters allows — so "37.5%" can be read against something.
  if (g.evenPercent) {
    const mark = el('div', 'gauge-mark');
    mark.style.left = `${g.evenPercent}%`;
    track.append(mark);
  }

  // The exact position, so the split between the two poles stays visible even
  // when the fill runs the whole width.
  const knob = el('div', 'gauge-knob');
  knob.style.left = `${g.percent}%`;
  track.append(knob);
  row.append(track);

  const foot = el('div', 'gauge-foot');
  foot.append(el('span', 'gauge-reading', g.reading));
  foot.append(el('span', 'gauge-detail', g.detail));
  row.append(foot);

  if (g.unstable && g.unstableNote) row.append(el('p', 'gauge-warn', g.unstableNote));
  if (g.provisional) {
    row.append(el('p', 'gauge-warn',
      '記録された時刻が日付の変わり目に近いので、この目盛りは日柱が動くと変わります。'));
  }
  if (g.note) row.append(el('p', 'gauge-note', g.note));
  return row;
}

function render(input) {
  const chart = buildChart(input, DEFAULT_AXES);
  const now = new Date();
  const nowJdUt = julianDay(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours() + now.getUTCMinutes() / 60,
  );
  const v = speak(chart, nowJdUt, input);
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

  // The one sentence to leave with, before any of the arithmetic.
  hero.append(el('p', 'hero-line', `一行で言うと——${v.verdict.lead}`));

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

  /* --- 4本の目盛り: the chart as four positions ------------------------- */
  {
    // The error bars decide whether the day-master gauges are provisional, so
    // they have to be resolved before the gauges are drawn.
    const uncertainty = resolveUncertainty(input, DEFAULT_AXES);
    const section = el('section', 'section');
    section.append(el('h2', 'plain-h2', 'あなたの目盛り'));
    section.append(el('p', 'voice-lead',
      '8文字を4つの尺度で測ったものです。真ん中に近いほど、どちらとも言えないという意味です。'));
    for (const g of gauges(chart, s, { dayStemUncertain: dayStemInDoubt(uncertainty) })) {
      section.append(gaugeRow(g));
    }
    output.append(section);
  }

  /* --- 強み / つまずき / 今すぐ ----------------------------------------- */
  for (const card of summaryCards(chart, s)) {
    if (card.bullets.length === 0) continue;
    const section = el('section', 'section');
    section.append(el('h2', 'plain-h2', `${card.mark} ${card.title}`));
    section.append(bulletList(card.bullets));
    output.append(section);
  }

  /* --- 場面ごと: 仕事 / 人づきあい / お金 / 心と体 ---------------------- */
  {
    const note = needAbsentNote(chart, s);
    if (note) {
      const lead = el('section', 'section');
      lead.append(el('h2', 'plain-h2', '場面ごとに見ると'));
      lead.append(prose(note.text, 'need-absent'));
      lead.append(citations(note));
      output.append(lead);
    }
    const scenes = domainBullets(chart, s);
    for (const { key, label } of DOMAINS) {
      const scene = scenes[key];
      if (!scene || scene.bullets.length === 0) continue;
      const section = el('section', 'section');
      section.append(el('h2', 'plain-h2', label));
      section.append(bulletList(scene.bullets));
      output.append(section);
    }
  }

  /* --- 時の欄: today inside the year inside the decade ------------------- */
  {
    const section = el('section', 'section');
    section.append(el('h2', 'plain-h2', v.when.title));
    const grid = el('div', 'when');
    for (const row of v.when.rows) {
      const item = el('div', `when-row is-${row.fit}`);
      item.append(el('span', 'when-scale', row.scale));
      item.append(el('span', 'when-when', row.when));
      item.append(el('span', 'when-pillar', row.pillar.text));
      item.append(el('span', 'when-fit', FIT_LABEL[row.fit]));
      grid.append(item);
    }
    section.append(grid);
    section.append(prose(v.when.text));
    section.append(citations(v.when));
    output.append(section);
  }

  /* --- 結論 + なぜ --- */
  // The hero already carries the verdict and the one-line version, so the long
  // form is depth rather than headline. The arithmetic fold stays as it was.
  const verdictSection = passage(v.verdict, { fold: true });
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
  // The hidden stems, so the branch rows above are not a black box.
  const zk = el('table');
  const zkBody = el('tbody');
  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const pil = chart.pillars[key];
    if (!pil) continue;
    const tr = el('tr');
    tr.append(el('th', null, `${label}支 ${pil.branchChar}`));
    tr.append(el('td', null,
      hiddenStems(pil.branchChar).map((h) => `${h.role} ${h.stemChar}`).join('／')));
    zkBody.append(tr);
  }
  zk.append(zkBody);
  why.append(el('p', 'hint',
    'それぞれの支の中に隠れている干（蔵干）は、こうです。'
    + '本気がいちばん強く、中気、余気の順に弱くなります。'));
  why.append(zk);

  why.append(el('p', 'hint',
    (s.margin < 1
      ? '※ 境目にかなり近い結果です。流派によっては逆の判定になります。'
      : '※ 境目からは離れているので、この判定は動きにくいほうです。')
    + (s.agrees
      ? '蔵干を数えても数えなくても、同じ判定になりました。'
      : `蔵干を数えないと ${s.alternative.label}（${s.alternative.score}）になります。流派で割れる命式です。`)));
  verdictSection.append(why);
  output.append(verdictSection);

  /* --- the long form, folded ------------------------------------------- */
  // These four say at length what the bullets above say in one line each. They
  // are kept in full — the register work in plainwords.js lives here — but they
  // no longer stand between the reader and the scannable part of the page.
  for (const entry of [v.need, v.portrait, v.absence, v.year]) {
    if (entry) output.append(passage(entry, { fold: true }));
  }

  /* --- 大運: the timeline ------------------------------------------------ */
  if (v.luck) {
    const section = passage(v.luck);
    const list = el('div', 'luck');
    for (const p of v.luck.luck.periods) {
      const row = el('div', `luck-row is-${p.fit}${p === v.luck.current ? ' is-now' : ''}`);
      // The first cycle starts mid-year; showing "7〜17歳" when it is really
      // 7歳6ヶ月 misplaces the one boundary a reader is likely to be on.
      row.append(el('span', 'luck-age',
        p.fromMonths ? `${p.fromAge}歳${p.fromMonths}ヶ月〜` : `${p.fromAge}〜${p.toAge}歳`));
      row.append(el('span', 'luck-pillar', p.pillar.text));
      row.append(el('span', 'luck-fit',
        { needed: '追い風', avoided: '向かい風', neutral: '平' }[p.fit]));
      if (p === v.luck.current) row.append(el('span', 'luck-now', `いま ${v.luck.age}歳`));
      list.append(row);
    }
    section.insertBefore(list, section.querySelector('.reading-source'));
    section.append(el('p', 'hint',
      `最初の10年が始まるのは ${v.luck.luck.onset.years}歳${v.luck.luck.onset.months}ヶ月。`
      + `生まれてから${v.luck.luck.onset.fromTerm}まで ${v.luck.luck.onset.days.toFixed(1)}日あり、`
      + `3日を1年として数えた結果です（余り1日＝4ヶ月）。端数の丸め方は流派で違います。`));
    output.append(section);
  } else if (state.sex === null) {
    const note = el('section', 'section');
    note.append(el('h2', 'plain-h2', '10年ごとの流れ'));
    note.append(el('p', 'hint',
      '大運（10年ごとの運）は、向きが「陽の年に生まれた男性は順行、女性は逆行」という規則で決まるため、'
      + '性別を選ばないと計算できません。上で選ぶと、追い風の10年がいつ来るかが出ます。'));
    output.append(note);
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

/**
 * Wiring for the 重ね page.
 *
 * The layout inverts the usual one. Apps that stack divination systems show the
 * systems first and the agreement last, as a payoff — by which point the reader
 * has watched four systems say 土 and is ready to be impressed. Here the
 * measured agreement comes first and the systems are the working, because the
 * number is the answer and the four readings are how it was arrived at.
 *
 * Nothing on this page is allowed to state an agreement without stating how
 * often that agreement happens anyway. That is enforced structurally: an
 * agreement with no measured rate is dropped, exactly as a statement with no
 * source is dropped elsewhere.
 */

import { initEphemeris, withinEphemeris, EPHEMERIS_YEARS } from './engine/swe.js';
import { allSystems } from './engine/systems.js';
import { agreements, agreementTally } from './engine/agreement.js';
import { AGREEMENT_RATES, AGREEMENT_SAMPLES } from './engine/agreementRates.js';
import { naturalFrequency } from './engine/uncertainty.js';
import { ELEMENT_NAMES } from './engine/pillars.js';
import { japanNow } from './engine/time.js';
import { calendarDate } from './engine/swe.js';
import { attachPlaceField } from './ui/placefield.js';
import { el } from './ui/render.js';
import { startSky } from './ui/sky.js';

startSky(document.getElementById('sky'));
attachPlaceField();

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

  // The latitude is optional by design: blank means no ascendant, and that is a
  // stated outcome rather than a failure. Number('') is 0, which is a perfectly
  // valid latitude on the equator, so the empty string is caught before the
  // conversion rather than after it.
  const latField = document.getElementById('latitude').value.trim();

  try {
    render({
      year, month, day, hour, minute,
      precision: time ? 'pm5' : 'unknown',
      longitude: Number(document.getElementById('longitude').value),
      latitude: latField === '' ? null : Number(latField),
    });
  } catch (error) {
    console.error(error);
    output.append(el('p', 'notice', '読めませんでした。入力を確かめてもう一度。'));
  }
});

/**
 * A source chip row, reusing the class the reading page already styles.
 *
 * Written as `.cites` first, which is defined nowhere — the chips rendered with
 * no spacing between them and ran together into one word. `.reading-source` is
 * the existing name for exactly this row.
 */
function cites(sources) {
  const wrap = el('p', 'reading-source');
  for (const source of sources) wrap.append(el('span', 'cite', source));
  return wrap;
}

/** The Western four, in Japanese, kept apart from 五行 by saying so. */
const ELEMENT_JA = {
  'west:fire': '火（西洋の四元素）',
  'west:earth': '地（西洋の四元素）',
  'west:air': '風（西洋の四元素）',
  'west:water': '水（西洋の四元素）',
};

const jst = (jd) => {
  const r = calendarDate(Math.round((jd + 9 / 24) * 1440) / 1440);
  const total = Math.round(r.hour * 60);
  return `${r.month}月${r.day}日 ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** One system's card. */
function card(title, note) {
  const section = el('section', 'layer');
  section.append(el('h2', 'layer-title', title));
  if (note) section.append(el('p', 'hint', note));
  return section;
}

function render(input) {
  const facts = allSystems(input);

  output.append(agreementSection(facts));
  output.append(kyuseiCard(facts));
  output.append(shukuyoCard(facts));
  output.append(westernCard(facts));
  output.append(numerologyCard(facts));
}

/**
 * The agreements, each beside the rate at which it happens anyway.
 *
 * An agreement whose chance rate was never measured is not shown at all. It
 * would be the one sentence on the page a reader could not calibrate, and this
 * page exists to calibrate exactly this sentence.
 */
function agreementSection(facts) {
  const section = el('section', 'layer layer-agreement');
  section.append(el('h2', 'layer-title', '一致'));

  const found = agreements(facts, AGREEMENT_RATES).filter((a) => a.frequency);
  const tally = agreementTally(facts);

  section.append(el('p', 'layer-lede',
    `比べられる組み合わせは ${tally.checked} 組。そのうち ${tally.agreed} 組が同じ方向を指しました。`));

  if (found.length === 0) {
    section.append(el('p', 'agreement-none',
      'どの2系統も違うことを言っています。これも珍しくありません——'
      + '下の「偶然ならどれくらい」を見ると、そもそも一致するほうが少数派だと分かります。'));
  }

  for (const item of found) {
    const row = el('div', 'agreement');
    row.append(el('p', 'agreement-claim',
      `${item.a.system}の${item.a.label}と、${item.b.system}の${item.b.label}が`
      + `どちらも「${item.valueLabel}」を指しています。`));

    const observed = item.frequency.observed;
    const independent = item.frequency.independent;
    const lift = observed / independent;

    const numbers = el('p', 'agreement-numbers');
    numbers.append(el('span', 'agreement-observed', `実測 ${(observed * 100).toFixed(1)}%`));
    numbers.append(el('span', 'agreement-null', `無関係なら ${(independent * 100).toFixed(1)}%`));
    numbers.append(el('span', 'agreement-lift', `${lift.toFixed(2)}倍`));
    row.append(numbers);

    // The sentence the whole page is for. Written from the measured ratio, so
    // it cannot drift away from the numbers printed directly above it.
    row.append(el('p', 'agreement-verdict', verdict(lift)));

    if (item.structural) row.append(el('p', 'hint', item.structural));
    // Named in words, not by projection key. A chip exists so the reader can
    // check the claim against something; `western:moon` is checkable only
    // against this file's own source.
    row.append(cites([
      `${item.a.system}／${item.a.label}`,
      `${item.b.system}／${item.b.label}`,
      `標本${AGREEMENT_SAMPLES.toLocaleString('ja-JP')}件`,
    ]));
    section.append(row);
  }

  const gloss = el('details', 'gloss');
  gloss.append(el('summary', 'gloss-summary', 'この数字の読み方'));
  gloss.append(el('p', 'hint',
    '「無関係なら」は、2つの系統がまったく関係ないと仮定したときに'
    + 'それでも同じ答えになる割合です。それぞれの系統が各々の答えを出す頻度から計算しています。'
    + '実測がこれと同じなら、その一致は何も語っていません。'));
  // Read out of the measured table rather than typed in. A sentence that
  // summarises numbers stored elsewhere is a sentence that goes stale the first
  // time those numbers are regenerated, and nothing would notice.
  const lifts = Object.values(AGREEMENT_RATES).map((r) => r.observed / r.independent);
  gloss.append(el('p', 'hint',
    `いま入っている${lifts.length}組すべてで、倍率は `
    + `${Math.min(...lifts).toFixed(2)}〜${Math.max(...lifts).toFixed(2)}倍の範囲にあります。`
    + '1.00倍が「まったくの偶然」です。つまり——'
    + '書いた日付の数字を足しただけの数秘術が、西洋占星術と同じ程度に四柱推命と一致します。'));
  section.append(gloss);

  return section;
}

function verdict(lift) {
  if (lift >= 1.5) return 'これは偶然より明らかに多く起きています。珍しい一致です。';
  if (lift >= 1.15) return '偶然よりは少し多い程度です。強い意味は持ちません。';
  if (lift > 0.85) return 'これは偶然そのものです。一致していますが、何も語っていません。';
  return '偶然より少ないくらいです。一致を意味と受け取らないでください。';
}

function kyuseiCard(facts) {
  const k = facts.kyusei;
  const section = card('九星気学', '年と月の切り替えを、暦ではなく立春・節入りで決めています。');
  if (!k) {
    section.append(el('p', 'hint', 'この記録では出せませんでした。'));
    return section;
  }

  for (const [label, star, source] of [
    ['本命星', k.year, `立春年:${k.solarYear}`],
    ['月命星', k.month, `節:${k.setsu}`],
  ]) {
    const row = el('div', 'layer-row');
    row.append(el('p', 'layer-value', `${label} ${star.name}`));
    row.append(el('p', 'layer-plain', star.plain));
    row.append(cites([source, `五行:${ELEMENT_NAMES[star.element]}`]));
    section.append(row);
  }

  // The boundary is the reason this system is worth computing properly, so the
  // distance to it is shown rather than kept as an internal detail.
  const days = k.daysSinceRisshun;
  if (days >= 0 && days < 5) {
    section.append(el('p', 'layer-edge',
      `立春から ${days.toFixed(1)} 日です。暦の年で計算する道具とは、ここで答えが分かれます。`));
  }
  return section;
}

function shukuyoCard(facts) {
  const s = facts.shukuyo;
  const section = card('宿曜（27宿）',
    '生まれた瞬間の月の位置から出しています。旧暦の表から引く流派とは答えが違うことがあります。');

  const row = el('div', 'layer-row');
  row.append(el('p', 'layer-value', s.mansion.name));
  row.append(el('p', 'layer-plain', s.mansion.plain));
  row.append(cites([`月の位置:${(s.index * (360 / 27)).toFixed(0)}〜${((s.index + 1) * (360 / 27)).toFixed(0)}°`, s.mansion.kana]));
  section.append(row);

  if (s.state === 'determinate') {
    section.append(el('p', 'layer-edge',
      `この宿にいるのは ${jst(s.enters)} から ${jst(s.leaves)} まで。記録の幅では変わりません。`));
  } else {
    const spread = el('div', 'layer-split');
    spread.append(el('p', 'layer-edge',
      s.minutes === null
        ? '時刻の記録が無いので、この日は2つの宿にまたがります。'
          + '月は1つの宿を約22時間で通るので、丸一日の窓ではほぼ必ずこうなります。'
        : `記録の幅（±${s.minutes}分）が宿の境をまたいでいます。`));
    for (const part of s.spread) {
      spread.append(el('p', 'layer-share',
        `${part.mansion.name}　幅のうち ${naturalFrequency(part.fraction)}`));
    }
    section.append(spread);
  }
  return section;
}

function westernCard(facts) {
  const w = facts.western;
  const section = card('西洋占星術の三点',
    '太陽は日付だけで決まり、月はおおよその時刻が要り、アセンダントは正確な時刻と緯度が要ります。');

  for (const [label, point] of [['太陽星座', w.sun], ['月星座', w.moon]]) {
    const row = el('div', 'layer-row');
    row.append(el('p', 'layer-value', `${label} ${point.sign.name}`));
    row.append(el('p', 'layer-plain', point.sign.plain));
    row.append(cites([`黄経:${point.degrees.toFixed(1)}°`, ELEMENT_JA[point.sign.element]]));
    if (point.state !== 'determinate') {
      row.append(el('p', 'layer-edge',
        `境にかかっています: ${point.spread.map((p) => `${p.sign.name} ${naturalFrequency(p.fraction)}`).join('／')}`));
    }
    section.append(row);
  }

  if (w.ascendant) {
    const row = el('div', 'layer-row');
    row.append(el('p', 'layer-value', `アセンダント ${w.ascendant.sign.name}`));
    row.append(el('p', 'layer-plain', w.ascendant.sign.plain));
    row.append(cites([`黄経:${w.ascendant.degrees.toFixed(1)}°`, '緯度を使用']));
    row.append(el('p', 'layer-edge',
      `この日この場所では30分で ${w.ascendant.degreesPerHalfHour.toFixed(1)}度 動きます`
      + `（星座の幅は30度）。時刻の記録がどれだけ効くかがこの数字です。`));
    if (w.ascendant.state !== 'determinate') {
      row.append(el('p', 'layer-edge',
        `記録の幅で変わります: ${w.ascendant.spread.map((p) => `${p.sign.name} ${naturalFrequency(p.fraction)}`).join('／')}`));
    }
    section.append(row);
  } else {
    // Refusal, shown as prominently as an answer would have been.
    section.append(el('p', 'layer-absent', w.ascendantMissing));
  }

  const phase = el('div', 'layer-row');
  phase.append(el('p', 'layer-value', `月相 ${w.phase.name}`));
  phase.append(el('p', 'layer-plain', w.phase.plain));
  phase.append(cites([`月齢:${w.phase.age.toFixed(1)}`, `離角:${w.phase.elongation.toFixed(0)}°`]));
  section.append(phase);

  return section;
}

function numerologyCard(facts) {
  const n = facts.numerology;
  const section = card('数秘術',
    'ここだけ、空を見ていません。書いた日付の数字を足しているだけです。'
    + `計算は「${n.method}」。`);

  const row = el('div', 'layer-row');
  row.append(el('p', 'layer-value', `ライフパス ${n.number}${n.master ? '（マスターナンバー）' : ''}`));
  row.append(el('p', 'layer-plain', n.plain));
  row.append(cites([`${n.digits}`, `合計:${n.total}`]));
  section.append(row);

  // The weight, stated by the module about itself. Leaving it to the reader to
  // notice that nine outcomes means one person in nine would be leaving them to
  // notice the one thing the system most needs said about it.
  section.append(el('p', 'layer-edge',
    '答えは9通り（マスターナンバーを入れて12通り）しかないので、'
    + 'この一行はおよそ9人に1人に当たります。宿曜の1宿は27人に1人、命式は桁が3つ違います。'
    + 'ほかの系統と同じ重さでは読まないでください。'));

  return section;
}

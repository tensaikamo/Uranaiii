/**
 * 姓名判断 — the name reading, and its one honest bridge to the birth chart.
 *
 * Two different systems. 四柱推命 reads the sky at a birth; 姓名判断 reads the
 * strokes of a written name. No school treats them as one method, so this file
 * does not fake a synthesis. What it does is connect them at the single place
 * they legitimately meet: **both speak 五行.**
 *
 * A stroke count has an element (by its last digit), and the birth chart has
 * already worked out which element the person needs (用神). So the question the
 * name can actually answer is: *does your name supply what your chart is short
 * of?* That is a real result, derived end to end, rather than a 吉凶 verdict
 * bolted on beside an unrelated reading.
 *
 * Deliberately NOT included: the 81-number 吉凶 table. It is the centre of most
 * commercial 姓名判断, and it varies enough between schools that shipping one
 * silently would mean picking a school and hiding it. There is no measured
 * ground for it either. If it goes in later it should arrive with its source
 * named, the way the ephemeris and the almanacs did.
 *
 * Stroke counts come from KANJIDIC2 (see strokes.js) — the counts a Japanese
 * dictionary gives. Schools that count 旧字体 will differ on some characters,
 * and the reading says which characters those are rather than hiding it.
 *
 * The name never leaves the page, same as the birth data (§7).
 */

import { strokesOf } from './strokes.js';
import { ELEMENT_PLAIN } from './plainwords.js';

/**
 * 画数 → 五行, by the last digit. 1,2 木 / 3,4 火 / 5,6 土 / 7,8 金 / 9,0 水.
 */
const ELEMENT_BY_LAST_DIGIT = ['water', 'wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water'];

export function elementOfCount(count) {
  return ELEMENT_BY_LAST_DIGIT[count % 10];
}

/** Count one written part, keeping any character we cannot count visible. */
function countPart(text) {
  const chars = [...String(text).normalize('NFC').trim()].filter((c) => !/\s/.test(c));
  const per = chars.map((ch) => ({ ch, strokes: strokesOf(ch) }));
  const unknown = per.filter((p) => p.strokes === null).map((p) => p.ch);
  const total = per.reduce((sum, p) => sum + (p.strokes || 0), 0);
  return { chars: per, total, unknown };
}

/**
 * The five 格.
 *
 * 霊数: when the family name or the given name is a single character, the
 * schools add a phantom stroke to 天格 / 地格 / 外格 — but never to 人格 or
 * 総格. That asymmetry is the convention, not an oversight.
 */
export function fiveGrids(surname, given) {
  const sei = countPart(surname);
  const mei = countPart(given);
  if (sei.chars.length === 0 || mei.chars.length === 0) return null;

  const seiSolo = sei.chars.length === 1;
  const meiSolo = mei.chars.length === 1;

  const 天格 = sei.total + (seiSolo ? 1 : 0);
  const 地格 = mei.total + (meiSolo ? 1 : 0);
  const 人格 = sei.chars[sei.chars.length - 1].strokes + mei.chars[0].strokes;
  const 総格 = sei.total + mei.total;
  const 外格 = 総格 - 人格 + (seiSolo ? 1 : 0) + (meiSolo ? 1 : 0);

  const grid = (name, count, meaning) => ({
    name, count, meaning, element: elementOfCount(count),
  });

  return {
    sei,
    mei,
    reiSuu: seiSolo || meiSolo,
    grids: [
      grid('人格', 人格, '性格と、人との関わり方。五格でいちばん重く見る'),
      grid('総格', 総格, '一生を通した全体。人格の次に重く見る'),
      grid('天格', 天格, '受け継いだ姓のぶん。本人が選べない部分'),
      grid('地格', 地格, '若いころと、体質・素質'),
      grid('外格', 外格, '外から見た印象、まわりとの関係'),
    ],
    unknown: [...sei.unknown, ...mei.unknown],
  };
}

/**
 * Read the name against the chart.
 *
 * The claim is narrow on purpose: whether the elements the name carries include
 * the one the birth chart needs. Nothing about luck, nothing about the number
 * being auspicious.
 */
export function readName(surname, given, strength) {
  const five = fiveGrids(surname, given);
  if (!five) return null;

  const needed = new Set(strength.needed);
  const avoided = new Set(strength.avoided);

  const supplies = five.grids.filter((g) => needed.has(g.element));
  const drains = five.grids.filter((g) => avoided.has(g.element));
  const jinkaku = five.grids[0];

  const el = (e) => ELEMENT_PLAIN[e].name;
  const doing = (e) => ELEMENT_PLAIN[e].doing;

  let verdict;
  let text;
  if (supplies.length === 0) {
    verdict = 'none';
    text = `あなたに効くのは${strength.needed.map(el).join('と')}ですが、五格の五行にそれは出てきません。`
      + `名前は、足りないものを補う側には回っていない、ということです。\n\n`
      + `名前が悪いという話ではありません。補いは名前の外——${strength.needed.map((e) => doing(e)).join('、')}——`
      + `で作ることになります。`;
  } else if (needed.has(jinkaku.element)) {
    verdict = 'strong';
    text = `五格でいちばん重く見る**人格が${jinkaku.count}画で、五行は${el(jinkaku.element)}**。`
      + `これはあなたに効く五行です。\n\n`
      + `名前が、命式の足りない側をそのまま補う形になっています。`
      + `${doing(jinkaku.element)}——名乗るたびにこの方向を思い出せる名前だ、という読み方をします。`;
  } else {
    verdict = 'partial';
    text = `人格（${jinkaku.count}画・${el(jinkaku.element)}）は効く五行ではありませんが、`
      + `${supplies.map((g) => `${g.name}（${g.count}画・${el(g.element)}）`).join('と')}`
      + `にあなたの必要な${supplies.map((g) => el(g.element)).join('と')}が出ています。\n\n`
      + `部分的に補っている形です。${supplies.map((g) => g.name).join('と')}が働く場面——`
      + `${supplies.map((g) => g.meaning).join('、')}——では、追い風になります。`;
  }

  return {
    five,
    verdict,
    text,
    supplies,
    drains,
    source: [
      `surname:${five.sei.chars.map((c) => c.ch).join('')}`,
      `given:${five.mei.chars.map((c) => c.ch).join('')}`,
      `人格:${jinkaku.count}画`,
      `element:${el(jinkaku.element)}`,
      ...strength.needed.map((e) => `needed:${el(e)}`),
    ],
    key: `name:${verdict}`,
  };
}

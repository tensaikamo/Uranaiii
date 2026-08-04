/**
 * The at-a-glance block: the first screen of the 語り page.
 *
 * Four formats borrowed from divination that people actually read, rendered
 * above everything the page already had. Nothing below was removed — the
 * complaint was that the app was hard to read, not that it said too much, and
 * deleting the working would have answered a different complaint.
 *
 * ## Marks are never colour alone
 *
 * ◎○△ carry their meaning in the glyph and in a word beside it, and the
 * accessible name spells the whole thing out. Colour only separates the rows.
 * A three-step scale rendered as green/amber/red is unreadable to a red-green
 * viewer and invisible to a screen reader, and it is the single easiest place
 * in this app to have made that mistake.
 */

import { el } from './render.js';
import { MARK_SCALE } from '../engine/glance.js';
import { RELATION_PLAIN } from '../engine/compass.js';

/** Source chips, in the row class the reading page already styles. */
function cites(sources) {
  const wrap = el('p', 'reading-source');
  for (const source of sources) wrap.append(el('span', 'cite', source));
  return wrap;
}

/** 一言 — the line a reader leaves with. */
export function renderHeadline(head, frequency) {
  if (!head) return null;
  const box = el('section', 'glance-head');
  box.append(el('p', 'glance-phrase', head.phrase));
  box.append(el('p', 'glance-type', head.type));
  box.append(el('p', 'glance-tag', head.tag));
  if (frequency) box.append(el('p', 'glance-freq', frequency));
  box.append(cites(head.source));
  return box;
}

/** ◎○△ — the four settings, readable without reading. */
export function renderMarks(list) {
  const box = el('section', 'glance-marks');
  box.append(el('h2', 'glance-title', 'いまの4つ'));
  box.append(el('p', 'hint', 'この盤の中での比べ方です。◎はあなたの4つの中でいちばん風が味方している場面。'));

  const table = el('ul', 'mark-list');
  for (const item of list) {
    const row = el('li', `mark-row is-${item.key}`);
    // The glyph is decorative once the word is present; the row's own label
    // carries the meaning for anything that does not render glyphs.
    const glyph = el('span', 'mark-glyph', item.mark);
    glyph.setAttribute('aria-hidden', 'true');
    row.append(glyph);
    row.append(el('span', 'mark-label', item.label));
    row.append(el('span', 'mark-word', item.word));
    row.setAttribute('aria-label', `${item.label}：${item.word}。${item.note}`);
    table.append(row);
  }
  box.append(table);

  const gloss = el('details', 'gloss');
  gloss.append(el('summary', 'gloss-summary', '記号の意味と、その根拠'));
  for (const scale of MARK_SCALE) {
    gloss.append(el('p', 'hint', `${scale.mark}　${scale.word} — ${scale.note}`));
  }
  for (const item of list) {
    const line = el('p', 'hint', `${item.label}：`
      + (item.element ? `${item.elementName}が担当（${item.relation}）` : 'この記録では出せません'));
    gloss.append(line);
    gloss.append(cites(item.source));
  }
  box.append(gloss);
  return box;
}

/**
 * 時期 — the 大運 folded into named eras.
 *
 * Drawn as a proportional strip so the lengths are visible, with the era
 * containing today marked. The band lower down the page still shows every
 * single year; this is the same data at the scale a person can hold.
 */
export function renderEras(list, age) {
  if (!list || list.length === 0) return null;
  const box = el('section', 'glance-eras');
  box.append(el('h2', 'glance-title', '時期'));

  const total = list[list.length - 1].toAge - list[0].fromAge;
  const strip = el('div', 'era-strip');
  strip.setAttribute('role', 'list');
  let current = null;

  for (const era of list) {
    const width = ((era.toAge - era.fromAge) / total) * 100;
    const cell = el('div', `era-cell is-${era.fit}`);
    cell.style.flexBasis = `${width}%`;
    cell.setAttribute('role', 'listitem');
    const here = age != null && age >= era.fromAge && age < era.toAge;
    if (here) { cell.classList.add('is-now'); current = era; }
    cell.append(el('span', 'era-name', era.name));
    cell.append(el('span', 'era-span', `${Math.round(era.fromAge)}〜${Math.round(era.toAge)}`));
    cell.setAttribute('aria-label',
      `${Math.round(era.fromAge)}歳から${Math.round(era.toAge)}歳は${era.name}${here ? '。いまここです' : ''}`);
    strip.append(cell);
  }
  box.append(strip);

  if (current) {
    box.append(el('p', 'era-now', `いまは【${current.name}】。${current.note}。`));
    box.append(cites(current.source));
  }
  return box;
}

/** 今日 — one line, one thing to do, one to leave alone. */
export function renderToday(today, frequency) {
  if (!today) return null;
  const box = el('section', 'glance-today');
  box.append(el('h2', 'glance-title', '今日'));
  box.append(el('p', `today-line is-${today.fit}`,
    `${today.elementName}の日。${today.headline}`));

  const acts = el('ul', 'today-acts');
  if (today.doThis) {
    const item = el('li', 'today-do');
    item.append(el('span', 'act-mark', '○'));
    item.append(el('span', 'act-text', today.doThis));
    item.setAttribute('aria-label', `やるといいこと：${today.doThis}`);
    acts.append(item);
  }
  if (today.avoidThis) {
    const item = el('li', 'today-avoid');
    item.append(el('span', 'act-mark', '×'));
    item.append(el('span', 'act-text', today.avoidThis));
    item.setAttribute('aria-label', `控えるといいこと：${today.avoidThis}`);
    acts.append(item);
  }
  box.append(acts);
  box.append(el('p', 'hint',
    'やること・控えることは盤から出しています。日によって変わるのは、その難しさのほうです。'));
  if (frequency) box.append(el('p', 'glance-freq', frequency));
  box.append(cites(today.source));
  return box;
}

/**
 * 吉方位 — rendered where it is derived, beside 九星気学.
 *
 * Every direction says *why*, because a bare list of lucky directions cannot be
 * checked against anything. The 凶 are shown too: a compass that only names the
 * good directions is hiding half of what it computed.
 */
export function renderCompass(result) {
  if (!result) return null;
  const box = el('div', 'layer-row compass');
  box.append(el('p', 'layer-value', `${result.solarYear}年の方位`));

  if (result.good.length === 0) {
    box.append(el('p', 'layer-plain', 'この年、あなたに開いている方位はありません。'));
  } else {
    const list = el('ul', 'compass-good');
    for (const palace of result.good) {
      const item = el('li', 'compass-item');
      item.append(el('span', 'compass-dir', palace.name));
      item.append(el('span', 'compass-star', palace.star.name));
      item.append(el('span', 'compass-why', RELATION_PLAIN[palace.relation]));
      list.append(item);
    }
    box.append(list);
  }

  if (result.bad.length > 0) {
    box.append(el('p', 'layer-edge',
      `避ける方位：${result.bad.map((p) => `${p.name}（${p.bad.join('・')}）`).join('、')}`));
  }
  box.append(el('p', 'hint', result.scope));
  box.append(cites([`本命星:${result.mine.name}`, `中宮:${result.centre.name}`]));
  return box;
}

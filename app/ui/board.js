/**
 * 命式の図 — the four pillars as a board rather than a line of text.
 *
 * The 語り page opened with `庚午 壬午 辛亥 辛卯` set as a row of characters. That
 * is the single most important object on the page and it was rendered as a
 * string. This draws it the way a 鑑定 sheet does: four columns, the stem above
 * its branch, what each character *is* marked beside it, and the hidden stems
 * and 通変星 that the sections below are built on.
 *
 * Colour rules, from the dataviz method:
 *   - The five element hues are **identity**, and they ride the 干支 glyph — the
 *     glyph *is* the datum here, not a label about one. Every other piece of text
 *     (position names, 通変星, 蔵干) wears a text token, never a data hue.
 *   - Identity is never colour-alone: the character itself names the element to
 *     anyone who reads 干支, and the element's name is printed under the column.
 *   - 金 is deliberately near-achromatic (it measures below the chroma floor and
 *     reads grey). That is what 金 means, and the glyph beside it carries the
 *     identity, which is the secondary encoding the floor requires.
 */

import { hiddenStems } from '../engine/hidden.js';
import { chartTenGods } from '../engine/tenGods.js';
import { el } from './render.js';

const COLUMNS = [
  { key: 'year', label: '年', governs: '生まれと親' },
  { key: 'month', label: '月', governs: '仕事と社会' },
  { key: 'day', label: '日', governs: 'あなた自身' },
  { key: 'hour', label: '時', governs: '晩年と体' },
];

/**
 * The board.
 *
 * `showGods` adds the 通変星 row. It is on by default because those labels are
 * what the 仕事・お金 sections are written from, and a reader checking a bullet
 * should be able to find the character it came from without opening a fold.
 */
export function buildBoardFigure(chart, { showGods = true } = {}) {
  const figure = el('figure', 'board-fig');
  const gods = showGods ? chartTenGods(chart.pillars) : [];
  const godAt = new Map(gods.map((g) => [g.position, g.god]));

  const grid = el('div', 'board-grid');

  for (const { key, label, governs } of COLUMNS) {
    const pillar = chart.pillars[key];
    const column = el('div', `board-col${key === 'day' ? ' is-self' : ''}`);

    column.append(el('div', 'board-pos', label));

    if (!pillar) {
      // A timeless record is three pillars. The column stays, empty and named,
      // rather than closing up — the absence is a fact about the record.
      //
      // Built from the same five slots as a full column, with the stem and
      // branch cells empty. The first version collapsed it to three elements;
      // the heights happened to match so nothing looked wrong, but the column
      // was a different shape from its neighbours, and any rule about the grid
      // stopped holding for exactly the input the app documents as supported.
      for (const role of ['stem', 'branch']) {
        const cell = el('div', `board-cell is-${role} is-absent`);
        cell.append(el('span', 'board-glyph', role === 'stem' ? '—' : ''));
        cell.append(el('span', 'board-god', ''));
        column.append(cell);
      }
      column.append(el('div', 'board-hidden'));
      column.append(el('div', 'board-governs', '時刻の記録なし'));
      grid.append(column);
      continue;
    }

    for (const [role, char, element] of [
      ['stem', pillar.stemChar, pillar.stemElement],
      ['branch', pillar.branchChar, pillar.branchElement],
    ]) {
      const cell = el('div', `board-cell is-${role}`);
      const glyph = el('span', `board-glyph el-${element}`, char);
      cell.append(glyph);
      const god = godAt.get(`${label}${role === 'stem' ? '干' : '支'}`);
      // The day stem is the thing every 通変星 is measured *from*, so it has
      // none of its own. Left blank it knocked the 蔵干 and palace rows in this
      // column out of line with the other three, so it is named instead — which
      // is also the more useful label.
      cell.append(el('span', `board-god${god ? '' : ' is-self'}`, god || '本人'));
      column.append(cell);
    }

    // 蔵干 — what the branch is holding. 本気 first, and it is the one the
    // 通変星 above was read from, so it is marked rather than just listed.
    const hidden = el('div', 'board-hidden');
    for (const h of hiddenStems(pillar.branchChar)) {
      hidden.append(el('span', `board-hid${h.role === '本気' ? ' is-main' : ''}`, h.stemChar));
    }
    column.append(hidden);
    column.append(el('div', 'board-governs', governs));

    grid.append(column);
  }

  figure.append(grid);

  const caption = el('figcaption', 'board-caption');
  caption.append(el('span', 'board-key', '上＝干、下＝支'));
  caption.append(el('span', 'board-key', '小さい字は通変星'));
  caption.append(el('span', 'board-key', 'いちばん下は支に隠れた干（太字が本気）'));
  figure.append(caption);

  return figure;
}

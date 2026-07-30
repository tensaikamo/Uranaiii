/**
 * 大運と流年の帯 — the decades, and every single year inside them.
 *
 * The 大運 was a list of rows: ten-year blocks with a word for each. A life is
 * not experienced in ten-year blocks, and the tradition does not read it that
 * way either — inside each 大運 sits the 流年, the pillar of that particular
 * year, and the reading is the pair. So the band draws both: the decade as the
 * span it is, and each of its ten years as its own cell.
 *
 * **Polarity is position, not colour, and that was forced by measurement.**
 * The five element hues are already spoken for by identity, and a sixth and
 * seventh hue for 追い風/向かい風 measured ΔE 4.4 against 木 and 火 — under a
 * floor of 15, meaning a full-colour reader cannot tell them apart. So the
 * strongest channel available goes to the thing that matters most: cells rise
 * above the centre line for 追い風 and drop below it for 向かい風. Element hue
 * stays on the year's own stem, where it means what it means everywhere else,
 * and the labels 追い風/向かい風 are always printed. Three channels, no collision.
 */

import { pillarFromIndex } from '../engine/pillars.js';
import { el } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 104;
const MID = 52;
const RISE = 26;
const CELL_GAP = 2; // the surface gap that separates touching marks

function node(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** The 干支 of a solar year. Same derivation the natal chart uses. */
export function yearPillarOf(solarYear) {
  return pillarFromIndex(((solarYear - 4) % 60 + 60) % 60);
}

/**
 * Every year from the first 大運 to the last, with its pillar and its fit.
 *
 * `birthYear` is the *solar* year of the chart, so the annual pillars line up
 * with the 立春 boundary the rest of the engine uses rather than with 1 January.
 */
export function annualYears(luck, strength, birthYear) {
  const rows = [];
  for (const period of luck.periods) {
    for (let k = 0; k < 10; k += 1) {
      const age = period.fromAge + (period.fromMonths || 0) / 12 + k;
      const solarYear = birthYear + Math.floor(age);
      const pillar = yearPillarOf(solarYear);
      rows.push({
        solarYear,
        age: Math.floor(age),
        pillar,
        period,
        fit: strength.needed.includes(pillar.stemElement) ? 'needed'
          : strength.avoided.includes(pillar.stemElement) ? 'avoided' : 'neutral',
      });
    }
  }
  return rows;
}

const FIT_TEXT = { needed: '追い風', avoided: '向かい風', neutral: '平' };
const FIT_MARK = { needed: '▲', avoided: '▼', neutral: '—' };

/**
 * The band.
 *
 * `nowAge` marks where the reader is standing. Passing null (no sex given, so no
 * 大運) is not a case here — the caller does not build the figure at all.
 */
export function buildLuckBand(luck, strength, { birthYear, nowAge = null } = {}) {
  const years = annualYears(luck, strength, birthYear);
  const cellW = 9;
  const width = years.length * cellW;

  const svg = node('svg', {
    viewBox: `0 0 ${width} ${H}`,
    class: 'band',
    preserveAspectRatio: 'xMinYMid meet',
    role: 'img',
    'aria-label': `${years[0].solarYear}年から${years[years.length - 1].solarYear}年まで、`
      + `一年ごとの追い風と向かい風。上に出ている年が追い風、下がっている年が向かい風。`
      + (nowAge === null ? '' : `いまは${nowAge}歳。`),
  });

  // The centre line: 平 sits on it, so "nothing" reads as nothing.
  svg.append(node('line', {
    class: 'band-axis', x1: 0, y1: MID, x2: width, y2: MID,
  }));

  // Decade separators and their 干支, behind the year cells.
  const decades = node('g', { class: 'band-decades' });
  for (const period of luck.periods) {
    const first = years.findIndex((y) => y.period === period);
    if (first < 0) continue;
    const x = first * cellW;
    decades.append(node('line', { class: 'band-sep', x1: x, y1: 20, x2: x, y2: H - 18 }));
    const label = node('text', { class: 'band-decade', x: x + 4, y: 13 });
    // The 大運 pillar is worth naming; the 流年 of all ninety years is not —
    // ninety glyphs at this size is noise, and each year already carries its
    // 干支 in the label a screen reader and a focus ring read out.
    label.textContent = period.pillar.text;
    decades.append(label);
  }
  svg.append(decades);

  const cells = node('g', { class: 'band-cells' });
  for (const [i, y] of years.entries()) {
    const x = i * cellW;
    const h = y.fit === 'neutral' ? 4 : RISE;
    const top = y.fit === 'needed' ? MID - h : y.fit === 'avoided' ? MID : MID - 2;

    const g = node('g', {
      class: `band-cell is-${y.fit}${nowAge !== null && y.age === nowAge ? ' is-now' : ''}`,
      tabindex: '0',
      role: 'listitem',
      'aria-label': `${y.solarYear}年 ${y.age}歳 ${y.pillar.text} ${FIT_TEXT[y.fit]}`,
    });
    // One colour for every bar. The first draft tinted each year by its stem's
    // element and it read exactly wrong: a wall of red bars says "bad years" to
    // anyone, when red means 火. Large areas of a categorical hue get read as
    // status whatever the legend says, so the hue comes off the bar entirely and
    // polarity keeps the channel to itself.
    g.append(node('rect', {
      class: 'band-bar',
      x: x + CELL_GAP / 2, y: top, width: cellW - CELL_GAP, height: h, rx: 2,
    }));
    cells.append(g);
  }
  svg.append(cells);

  const nowIndex = nowAge === null ? -1 : years.findIndex((y) => y.age === nowAge);
  const nowX = nowIndex >= 0 ? nowIndex * cellW + cellW / 2 : null;

  // Age ticks every ten years, so a position on the band can be read as a time
  // without counting cells. The "いま" label shares this row, so a tick that
  // would sit under it is dropped rather than drawn on top of it.
  const ticks = node('g', { class: 'band-ticks' });
  for (const [i, y] of years.entries()) {
    if (y.age % 10 !== 0) continue;
    const x = i * cellW + cellW / 2;
    if (nowX !== null && Math.abs(x - nowX) < 16) continue;
    const t = node('text', { class: 'band-age', x, y: H - 4, 'text-anchor': 'middle' });
    t.textContent = `${y.age}`;
    ticks.append(t);
  }
  svg.append(ticks);

  // Where the reader is standing, drawn last so it sits over everything. The
  // label goes in the tick row, not the top row — up there it landed on the
  // 大運 name whenever the reader happened to be near a decade boundary.
  if (nowX !== null) {
    svg.append(node('line', { class: 'band-now', x1: nowX, y1: 18, x2: nowX, y2: H - 14 }));
    const tag = node('text', { class: 'band-now-tag', x: nowX, y: H - 4, 'text-anchor': 'middle' });
    tag.textContent = `いま ${nowAge}`;
    svg.append(tag);
  }

  const figure = el('figure', 'band-fig');
  const scroller = el('div', 'band-scroll');
  scroller.append(svg);
  figure.append(scroller);

  // A whole life is wider than a phone, so the band scrolls — and it should open
  // where the reader actually is, not at their birth. Done after layout, since
  // the scroll width is not known until the SVG has been measured.
  if (nowIndex >= 0) {
    requestAnimationFrame(() => {
      const target = (nowIndex / years.length) * scroller.scrollWidth - scroller.clientWidth / 2;
      scroller.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
    });
  }

  const caption = el('figcaption', 'band-caption');
  for (const fit of ['needed', 'neutral', 'avoided']) {
    caption.append(el('span', `band-key is-${fit}`, `${FIT_MARK[fit]} ${FIT_TEXT[fit]}`));
  }
  caption.append(el('span', 'band-key', '一マスが一年。縦の区切りが10年ごとの大運'));
  figure.append(caption);

  return figure;
}

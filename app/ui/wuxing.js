/**
 * 五行の図 — the pentagon, with 相生 round the outside and 相剋 across the middle.
 *
 * This is the most recognisable diagram in the whole tradition, and the app had
 * been showing the same data as a row of horizontal bars. The bars answer "how
 * many of each"; the pentagon answers "how many, *and how do they act on each
 * other*" — which is the question every judgement in this engine actually turns
 * on. 生 and 剋 are the two relations `strength.js` weighs, drawn as the two
 * figures they are: a ring and a star.
 *
 * Encoding, and why each channel was chosen:
 *   - **Node area** carries the count. Area, not radius — doubling the count has
 *     to look like double, and radius would square it.
 *   - **Hue** carries element identity, the same five the board uses. Never the
 *     only channel: every node is labelled with its character.
 *   - **A hollow ring** is zero. An absent element is not a small node, it is a
 *     different state, and the reading treats it as one.
 *   - **用神 / 忌神** get a mark and a word, not a colour — the five hues are
 *     already spoken for by identity, and measurement says a sixth and seventh
 *     hue cannot be told apart from 木 and 火 (ΔE 4.4 against a floor of 15).
 *
 * Geometry: the five sit clockwise from the top in 相生 order 木→火→土→金→水, so
 * the outer ring is the generating cycle by construction. Joining every second
 * node then traces the 相剋 pentagram — the controlling cycle is the star you get
 * for free from that ordering, which is why the diagram is drawn this way and not
 * some other.
 */

import { ELEMENTS, ELEMENT_NAMES } from '../engine/pillars.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 相生 order, clockwise from the top. The 相剋 star falls out of it. */
const RING = ['wood', 'fire', 'earth', 'metal', 'water'];

const SIZE = 300;
const C = SIZE / 2;
const R = 104;
const R_MAX = 30;
const R_MIN = 13;

function node(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** Position of an element on the ring. */
function at(element) {
  const i = RING.indexOf(element);
  const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
  return { x: C + Math.cos(a) * R, y: C + Math.sin(a) * R };
}

/** Shorten a segment at both ends so it stops short of the two nodes it joins. */
function trim(from, to, startGap, endGap) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: from.x + (dx / len) * startGap,
    y1: from.y + (dy / len) * startGap,
    x2: to.x - (dx / len) * endGap,
    y2: to.y - (dy / len) * endGap,
  };
}

/**
 * Build the figure.
 *
 * `counts` is the 五行 tally, `needed` / `avoided` the elements the chart wants
 * and wants less of, `sources` the characters each count came from.
 */
export function buildWuxingFigure(counts, { needed = [], avoided = [], sources = {} } = {}) {
  const total = ELEMENTS.reduce((n, e) => n + counts[e], 0) || 1;
  const peak = Math.max(1, ...ELEMENTS.map((e) => counts[e]));
  // Area ∝ count, so radius ∝ √count.
  const radius = (e) => (counts[e] === 0 ? R_MIN : R_MIN + (R_MAX - R_MIN) * Math.sqrt(counts[e] / peak));

  const svg = node('svg', {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    class: 'wuxing',
    role: 'img',
    'aria-label': `五行の数。${ELEMENTS.map((e) => `${ELEMENT_NAMES[e]}${counts[e]}`).join('、')}。`
      + `外側の輪が相生、内側の星が相剋。`,
  });

  const relations = node('g', { class: 'wx-relations' });

  // 相生 — the ring. Drawn as arcs between neighbours so it reads as a cycle
  // rather than as five unrelated links.
  for (let i = 0; i < 5; i += 1) {
    const from = at(RING[i]);
    const to = at(RING[(i + 1) % 5]);
    const t = trim(from, to, radius(RING[i]) + 7, radius(RING[(i + 1) % 5]) + 11);
    const path = node('path', {
      class: 'wx-sheng',
      d: `M${t.x1.toFixed(1)} ${t.y1.toFixed(1)} A ${R * 1.32} ${R * 1.32} 0 0 1 ${t.x2.toFixed(1)} ${t.y2.toFixed(1)}`,
      'marker-end': 'url(#wx-arrow)',
    });
    relations.append(path);
  }

  // 相剋 — the star. Every second node; five straight chords.
  for (let i = 0; i < 5; i += 1) {
    const from = at(RING[i]);
    const to = at(RING[(i + 2) % 5]);
    const t = trim(from, to, radius(RING[i]) + 7, radius(RING[(i + 2) % 5]) + 11);
    relations.append(node('line', {
      class: 'wx-ke',
      x1: t.x1.toFixed(1), y1: t.y1.toFixed(1), x2: t.x2.toFixed(1), y2: t.y2.toFixed(1),
      'marker-end': 'url(#wx-arrow-ke)',
    }));
  }

  const defs = node('defs');
  for (const [id, cls] of [['wx-arrow', 'wx-head'], ['wx-arrow-ke', 'wx-head is-ke']]) {
    const marker = node('marker', {
      id, viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse',
    });
    marker.append(node('path', { d: 'M0 1 L9 5 L0 9 z', class: cls }));
    defs.append(marker);
  }
  svg.append(defs);
  svg.append(relations);

  // Nodes last, so they sit over the lines they anchor.
  const marks = node('g', { class: 'wx-nodes' });
  for (const element of RING) {
    const p = at(element);
    const r = radius(element);
    const count = counts[element];
    const isNeeded = needed.includes(element);
    const isAvoided = avoided.includes(element);

    const g = node('g', {
      class: `wx-node el-${element}${count === 0 ? ' is-empty' : ''}`
        + `${isNeeded ? ' is-needed' : ''}${isAvoided ? ' is-avoided' : ''}`,
      tabindex: '0',
      role: 'listitem',
      'aria-label': `${ELEMENT_NAMES[element]} ${count}`
        + (count === 0 ? '、この盤に無い' : `。${(sources[element] || []).join('、')}`)
        + (isNeeded ? '。効く五行' : isAvoided ? '。消耗する五行' : ''),
    });

    // 用神 gets a ring outside the node — a mark, not a hue.
    if (isNeeded) g.append(node('circle', { class: 'wx-halo', cx: p.x, cy: p.y, r: r + 6 }));
    g.append(node('circle', { class: 'wx-disc', cx: p.x, cy: p.y, r }));
    const label = node('text', { class: 'wx-label', x: p.x, y: p.y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    label.textContent = ELEMENT_NAMES[element];
    g.append(label);

    const n = node('text', {
      class: 'wx-count', x: p.x, y: p.y + r + 15, 'text-anchor': 'middle',
    });
    n.textContent = count === 0 ? 'なし' : String(count);
    g.append(n);
    marks.append(g);
  }
  svg.append(marks);

  const figure = document.createElement('figure');
  figure.className = 'wuxing-fig';
  figure.append(svg);

  const caption = document.createElement('figcaption');
  caption.className = 'wuxing-caption';
  const key = (cls, text) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  };
  caption.append(key('wx-key is-sheng', '外まわり＝生む'));
  caption.append(key('wx-key is-ke', '内側＝抑える'));
  caption.append(key('wx-key is-need', '◎＝効く五行'));
  caption.append(key('wx-key', `合計 ${total}字`));
  figure.append(caption);

  return figure;
}

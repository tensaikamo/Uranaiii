/**
 * 天盤 — the celestial dial.
 *
 * This is a data visualisation, not an ornament. Every mark on it is a value
 * the engine computed:
 *
 *   outer ring  the twelve 節 sectors, placed at their true ecliptic
 *               longitudes, unwrapped from 立春 at the top — the same
 *               coordinate the month-branch logic uses, made visible
 *   sun         the Sun's apparent longitude at the moment of birth
 *   inner ring  the twelve 時辰 of the local day
 *   two hands   standard time and local apparent time. The angle between them
 *               *is* the 27 minutes; it is drawn rather than described
 *   arc         the error bar, swept around the apparent-time hand
 *   centre      日主, the day stem
 *
 * Nothing is drawn that is not in the data, and nothing in the data is
 * decorated into looking more certain than it is.
 */

import { SETSU, degreesSinceRisshun, termIngresses } from '../engine/terms.js';
import { BRANCHES } from '../engine/pillars.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 360;
const C = SIZE / 2;

// Radii, outside in.
const R_RIM = 173;
const R_YEAR_OUT = 170;
const R_YEAR_IN = 143;
const R_BRANCH_TEXT = 157;
const R_TICK_OUT = 140;
// Inside the graduations, not in the label band: anywhere near r=157 the
// marker collides with a 月支 character whenever the Sun sits mid-sector.
const R_SUN = 129;
const R_HOUR_OUT = 108;
const R_HOUR_IN = 80;
const R_HOUR_TEXT = 94;
// The hands run *through* the 時辰 ring and stop just past it, so each one
// visibly points at the sector it selects. Short hands stuck inside the ring
// read as a smudge, and the few degrees between the two clocks vanish.
const R_HAND_IN = 40;
const R_HAND_OUT = 114;
const R_ERR = 117;      // outside the 時辰 ring, clear of the Sun

const rad = (deg) => (deg * Math.PI) / 180;
const px = (deg, r) => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];

function node(name, attrs = {}) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** Annular sector path between two angles, measured clockwise from the top. */
function ring(from, to, rOut, rIn) {
  const [x1, y1] = px(from, rOut);
  const [x2, y2] = px(to, rOut);
  const [x3, y3] = px(to, rIn);
  const [x4, y4] = px(from, rIn);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1} ${y1}A${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`
    + `L${x3} ${y3}A${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}Z`;
}

function arc(from, to, r) {
  const [x1, y1] = px(from, r);
  const [x2, y2] = px(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Hour of the local clock -> angle, with 0時 at the top. 子 straddles it. */
const hourAngle = (hour) => (hour / 24) * 360;

function defs() {
  const d = node('defs');
  d.innerHTML = `
    <radialGradient id="dial-well" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#111A27" stop-opacity="0.95"/>
      <stop offset="62%" stop-color="#0B121C" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#070C14" stop-opacity="0.6"/>
    </radialGradient>
    <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="var(--glow-core)" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="var(--glow-core)" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="var(--glow-core)" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="sun-glow" x="-160%" y="-160%" width="420%" height="420%">
      <feGaussianBlur stdDeviation="5.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  return d;
}

/**
 * Wire one mark to the inspect readout.
 *
 * Pointer and keyboard get the same detail, per the interaction rules: a value
 * that only appears on hover is unreachable on a phone and by a keyboard.
 */
function bindInspect(mark, detail, view) {
  const show = () => {
    mark.classList.add('is-hot');
    if (view.onInspect) view.onInspect(detail);
  };
  const hide = () => {
    mark.classList.remove('is-hot');
    if (view.onInspect) view.onInspect(null);
  };
  mark.addEventListener('pointerenter', show);
  mark.addEventListener('pointerleave', hide);
  mark.addEventListener('focus', show);
  mark.addEventListener('blur', hide);
  mark.addEventListener('click', show);
}

/**
 * Build the dial.
 *
 * `view` carries the two clocks separately so the gap between them can be
 * drawn: { chart, apparentHour, standardHour, uncertaintyMinutes, hourKnown }.
 */
export function buildDial(view) {
  const { chart } = view;
  const svg = node('svg', {
    class: 'dial',
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    role: 'img',
    'aria-label': '命式の天盤',
  });
  svg.append(defs());

  svg.append(node('circle', { cx: C, cy: C, r: R_RIM, fill: 'url(#dial-well)' }));
  svg.append(node('circle', { cx: C, cy: C, r: R_RIM, class: 'dial-rim' }));
  svg.append(node('circle', { cx: C, cy: C, r: R_YEAR_IN, class: 'dial-rule' }));
  svg.append(node('circle', { cx: C, cy: C, r: R_HOUR_OUT, class: 'dial-rule' }));
  svg.append(node('circle', { cx: C, cy: C, r: R_HOUR_IN, class: 'dial-rule' }));

  /* --- outer ring: the twelve 節, unwrapped from 立春 at the top --------- */
  const current = chart.pillars.period.branch;
  const yearGroup = node('g', { class: 'dial-year' });
  const ingresses = termIngresses(chart.time.ut, chart.axes.termMethod);
  SETSU.forEach((term, i) => {
    const from = i * 30;
    const live = term.branch === current;
    // The sector is the hit target, and it is far larger than the 24px floor.
    // Everything it reports is also in the register below, so the inspect
    // layer only ever enhances — it never gates a value.
    const sector = node('path', {
      d: ring(from + 0.6, from + 29.4, R_YEAR_OUT, R_YEAR_IN),
      class: `sector${live ? ' is-live' : ''}`,
      tabindex: '0',
      role: 'button',
    });
    const at = ingresses[i];
    const detail = {
      title: `${term.name}　${BRANCHES[term.branch]}月`,
      value: at ? view.formatTime(at.start) : '',
      note: `黄経 ${term.longitude}°`,
    };
    sector.setAttribute('aria-label', `${detail.title} ${detail.note} ${detail.value}`);
    bindInspect(sector, detail, view);
    yearGroup.append(sector);
    const [tx, ty] = px(from + 15, R_BRANCH_TEXT);
    const label = node('text', {
      x: tx, y: ty, class: `sector-label${live ? ' is-live' : ''}`,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    label.textContent = BRANCHES[term.branch];
    yearGroup.append(label);
  });
  svg.append(yearGroup);

  // 24 ticks: the 節 long, the 中気 between them short.
  const ticks = node('g', { class: 'dial-ticks' });
  for (let i = 0; i < 24; i += 1) {
    const deg = i * 15;
    const isSetsu = i % 2 === 0;
    const [x1, y1] = px(deg, R_TICK_OUT);
    const [x2, y2] = px(deg, R_TICK_OUT - (isSetsu ? 9 : 4.5));
    ticks.append(node('line', {
      x1, y1, x2, y2, class: isSetsu ? 'tick tick-setsu' : 'tick',
    }));
  }
  svg.append(ticks);

  // 立春 origin: the point the whole ordering is measured from.
  const [ox, oy] = px(0, R_YEAR_OUT + 3);
  svg.append(node('path', {
    d: `M${ox} ${oy}l-5 -8h10Z`, class: 'origin-mark',
  }));

  /* --- the Sun at the moment of birth ----------------------------------- */
  const sunDeg = degreesSinceRisshun(chart.pillars.period.longitude);
  const [sx, sy] = px(sunDeg, R_SUN);
  const [rx, ry] = px(sunDeg, 146);
  svg.append(node('line', { x1: sx, y1: sy, x2: rx, y2: ry, class: 'sun-ray' }));
  svg.append(node('circle', { cx: sx, cy: sy, r: 5.5, class: 'sun', filter: 'url(#sun-glow)' }));

  /* --- inner ring: the twelve 時辰 --------------------------------------- */
  // Sector fills first, then the hands, then the labels on top: a hand that
  // crosses the ring must not bury the character it is pointing at.
  const hourGroup = node('g', { class: 'dial-hours' });
  const labelGroup = node('g', { class: 'dial-hour-labels' });
  for (let j = 0; j < 12; j += 1) {
    const centre = j * 30;
    const live = view.hourKnown && chart.pillars.hour && chart.pillars.hour.branch === j;
    // A 時辰 spans two clock hours: 子 is 23:00-00:59, 丑 is 01:00-02:59, ...
    const from = (j * 2 + 23) % 24;
    const to = (from + 1) % 24;
    const hourSector = node('path', {
      d: ring(centre - 14.4, centre + 14.4, R_HOUR_OUT, R_HOUR_IN),
      class: `hour-sector${live ? ' is-live' : ''}`,
      'data-branch': j,
      tabindex: '0',
      role: 'button',
    });
    const pad = (n) => String(n).padStart(2, '0');
    const detail = {
      title: `${BRANCHES[j]}時`,
      value: `${pad(from)}:00 – ${pad(to)}:59`,
      note: '地方時',
    };
    hourSector.setAttribute('aria-label', `${detail.title} ${detail.value} ${detail.note}`);
    bindInspect(hourSector, detail, view);
    hourGroup.append(hourSector);
    const [hx, hy] = px(centre, R_HOUR_TEXT);
    const t = node('text', {
      x: hx, y: hy, class: `hour-label${live ? ' is-live' : ''}`,
      'data-branch': j, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    t.textContent = BRANCHES[j];
    labelGroup.append(t);
  }
  svg.append(hourGroup);

  /* --- the two clocks --------------------------------------------------- */
  if (view.hourKnown) {
    svg.append(node('path', { class: 'clock-gap', d: '' }));
    for (const which of ['standard', 'apparent']) {
      const g = node('g', { class: `hand hand-${which}` });
      g.append(node('line', {
        x1: C, y1: C - R_HAND_IN, x2: C, y2: C - R_HAND_OUT, class: 'hand-line',
      }));
      g.append(node('circle', { cx: C, cy: C - R_HAND_OUT, r: 3, class: 'hand-tip' }));
      svg.append(g);
    }
  }

  svg.append(labelGroup);

  if (view.hourKnown) {
    svg.append(node('path', { class: 'error-arc', d: '' }));
  } else {
    const t = node('text', {
      x: C, y: C + 50, class: 'dial-note', 'text-anchor': 'middle',
    });
    t.textContent = '時刻不明';
    svg.append(t);
  }

  /* --- centre: 日主 ------------------------------------------------------ */
  svg.append(node('circle', { cx: C, cy: C, r: 40, fill: 'url(#core-glow)', class: 'core-halo' }));
  const stem = node('text', {
    x: C, y: C - 2, class: 'core-stem', 'text-anchor': 'middle', 'dominant-baseline': 'central',
  });
  stem.textContent = chart.pillars.day.stemChar;
  svg.append(stem);
  const caption = node('text', {
    x: C, y: C + 30, class: 'core-caption', 'text-anchor': 'middle',
  });
  caption.textContent = '日主';
  svg.append(caption);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (view.animateIn && view.hourKnown && !still) {
    // Both hands start at the top of the dial and sweep round to the hour —
    // the one moment the chart is being *cast* rather than read.
    for (const g of svg.querySelectorAll('.hand')) g.style.transform = 'rotate(0deg)';
    requestAnimationFrame(() => requestAnimationFrame(() => updateDial(svg, view)));
  } else {
    updateDial(svg, view);
  }
  return svg;
}

/** Re-point the dial without rebuilding it, so the hands can move. */
export function updateDial(svg, view) {
  const { chart } = view;

  svg.style.setProperty('--glow-core', `var(--el-${chart.pillars.day.stemElement})`);
  const stem = svg.querySelector('.core-stem');
  if (stem) {
    stem.textContent = chart.pillars.day.stemChar;
    stem.setAttribute('class', `core-stem el-${chart.pillars.day.stemElement}`);
  }

  if (!view.hourKnown) return;

  const aDeg = hourAngle(view.apparentHour);
  const sDeg = hourAngle(view.standardHour);

  for (const [which, deg] of [['standard', sDeg], ['apparent', aDeg]]) {
    const hand = svg.querySelector(`.hand-${which}`);
    // CSS transform, not the SVG attribute: only this one animates.
    hand.style.transform = `rotate(${deg}deg)`;
    hand.classList.toggle('is-active', view.activeClock === which);
  }

  // The wedge between the two clocks: this is the correction, drawn.
  const gap = svg.querySelector('.clock-gap');
  const from = Math.min(sDeg, aDeg);
  const to = Math.max(sDeg, aDeg);
  gap.setAttribute('d', to - from > 0.15 ? ring(from, to, R_HAND_OUT, R_HAND_IN) : '');

  // The error bar, swept around whichever clock is active.
  const band = svg.querySelector('.error-arc');
  const centre = view.activeClock === 'standard' ? sDeg : aDeg;
  const half = view.uncertaintyMinutes === null ? 0 : view.uncertaintyMinutes / 4;
  band.setAttribute('d', half > 0.05 ? arc(centre - half, centre + half, R_ERR) : '');

  // The live 時辰 sector follows the active clock.
  const live = chart.pillars.hour ? chart.pillars.hour.branch : -1;
  for (const el of svg.querySelectorAll('[data-branch]')) {
    el.classList.toggle('is-live', Number(el.dataset.branch) === live);
  }
}

/**
 * Rendering (spec §5, §6).
 *
 * Wording rules that this file follows: errors state what happened and what to
 * do, without apologising; an unknown time is a three-pillar chart, not a
 * failure; anything that could not be computed is left blank rather than
 * filled with a plausible number.
 */

import { calendarDate } from '../engine/swe.js';
import { naturalFrequency } from '../engine/uncertainty.js';

const PILLAR_LABELS = [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']];

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * JST wall-clock rendering of a UT Julian Day.
 *
 * The rounding is done on the Julian Day, before the calendar conversion, so a
 * time that rounds up through midnight carries the date with it. Rounding the
 * decomposed hour/minute/second instead produces 24:00 on the previous date —
 * or, worse, 23:61.
 */
export function formatJst(jd, withSeconds = false) {
  const unit = withSeconds ? 1 / 86400 : 1 / 1440;
  const d = calendarDate(Math.round((jd + 9 / 24) / unit) * unit);
  const total = Math.round(d.hour / (withSeconds ? 1 / 3600 : 1 / 60));
  const hh = withSeconds ? Math.floor(total / 3600) : Math.floor(total / 60);
  const mm = withSeconds ? Math.floor(total / 60) % 60 : total % 60;
  const ss = total % 60;
  const date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  const time = withSeconds
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export function signedMinutes(value, digits = 1) {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(digits)}分`;
}

/** A span of time in plain Japanese, for the "17 minutes before" line. */
export function describeSpan(minutes) {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs.toFixed(0)}分`;
  if (abs < 1440) {
    const h = Math.floor(abs / 60);
    const m = Math.round(abs - h * 60);
    return m === 0 ? `${h}時間` : `${h}時間${m}分`;
  }
  const days = Math.floor(abs / 1440);
  const hours = Math.round((abs - days * 1440) / 60);
  return hours === 0 ? `${days}日` : `${days}日${hours}時間`;
}

/* --- the chart ----------------------------------------------------------- */

function glyph(char, element) {
  const node = el('span', `glyph ${element}`, char);
  node.dataset.char = char;
  return node;
}

export function buildChartElement(chart) {
  const wrap = el('div', 'chart');
  for (const [key, label] of PILLAR_LABELS) {
    const p = chart.pillars[key];
    const column = el('div', 'pillar');
    column.dataset.pillar = key;
    column.append(el('div', 'pillar-label', label));
    const glyphs = el('div', 'pillar-glyphs');
    if (p) {
      glyphs.append(glyph(p.stemChar, p.stemElement));
      glyphs.append(glyph(p.branchChar, p.branchElement));
    } else {
      // Nothing is invented to fill the hour column.
      glyphs.append(el('div', 'pillar-empty', '—'));
    }
    column.append(glyphs);
    wrap.append(column);
  }
  return wrap;
}

/**
 * Update an existing chart in place, animating only the characters that
 * actually change (spec §5.4: motion is spent here and nowhere else).
 */
export function updateChartElement(root, chart) {
  const changed = [];
  const instant = reducedMotion();

  for (const [key] of PILLAR_LABELS) {
    const column = root.querySelector(`[data-pillar="${key}"]`);
    const p = chart.pillars[key];
    const glyphs = [...column.querySelectorAll('.glyph')];
    const next = p ? [[p.stemChar, p.stemElement], [p.branchChar, p.branchElement]] : [];
    if (!p || glyphs.length !== next.length) continue;

    let columnChanged = false;
    glyphs.forEach((node, i) => {
      const [char, element] = next[i];
      // Compare against the character this glyph is *on its way to*, not the
      // one currently painted. Toggling again inside the 150ms leave animation
      // would otherwise look like "no change" while the earlier animation's
      // pending callback still lands, stranding the chart on the wrong state.
      const target = node.dataset.pending || node.dataset.char;
      if (target === char) return;
      columnChanged = true;
      node.dataset.pending = char;
      node.dataset.pendingElement = element;

      const apply = () => {
        // Always paint the latest requested target, not the one captured when
        // the animation started.
        node.textContent = node.dataset.pending;
        node.dataset.char = node.dataset.pending;
        node.className = `glyph ${node.dataset.pendingElement}`;
        delete node.dataset.pending;
        delete node.dataset.pendingElement;
      };

      if (instant) { apply(); return; }
      if (node.classList.contains('is-leaving')) return; // already animating out
      node.classList.add('is-leaving');
      node.addEventListener('animationend', () => {
        node.classList.remove('is-leaving');
        apply();
        node.classList.add('is-entering');
        node.addEventListener('animationend', () => node.classList.remove('is-entering'), { once: true });
      }, { once: true });
    });
    if (columnChanged) changed.push(key);
  }
  return changed;
}

/* --- certainty (§2.5) ---------------------------------------------------- */

const PILLAR_NAME = { year: '年柱', month: '月柱', day: '日柱', hour: '時柱' };

export function buildStateElement(resolution) {
  const box = el('div', `state ${resolution.state}`);

  if (resolution.state === 'determinate') {
    box.append(el('p', 'state-title', '確定'));
    const body = el('p', 'state-body');
    body.append(document.createTextNode('±'));
    body.append(el('span', 'mono', String(resolution.minutes)));
    body.append(document.createTextNode('分の幅の中に、柱が変わる境界はない。'));
    box.append(body);
    return box;
  }

  if (resolution.state === 'unknown') {
    box.append(el('p', 'state-title', '時刻不明 — 三柱'));
    const body = el('p', 'state-body',
      '時柱は計算していない。年柱・月柱・日柱の三柱で成立している。');
    box.append(body);
    if (resolution.outcomes.length > 1) {
      body.textContent += ' ただしこの日は節入りをまたぐため、月柱（あるいは年柱）は時刻によって変わる。';
      box.append(buildParallel(resolution));
    }
    return box;
  }

  box.append(el('p', 'state-title', '境界近傍 — 未確定'));
  const kinds = [...new Set(resolution.boundaries.map((b) => b.label))].join('、');
  const body = el('p', 'state-body');
  body.append(document.createTextNode('±'));
  body.append(el('span', 'mono', String(resolution.minutes)));
  const many = resolution.outcomes.length > 2;
  body.append(document.createTextNode(
    `分の幅が ${kinds} をまたぐ。${many ? 'どれになるか' : 'どちらか'}は、この記録からは決まらない。`));
  box.append(body);
  box.append(buildParallel(resolution));
  return box;
}

/** Both charts, side by side, with the share of the window each occupies. */
function buildParallel(resolution) {
  const list = el('div', 'parallel');
  // Differences are named relative to the chart the record actually gives, not
  // to whichever outcome happens to occupy the most of the window.
  const base = resolution.outcomes.find((o) => o.containsRecorded) || resolution.outcomes[0];

  for (const outcome of resolution.outcomes) {
    const item = el('div', 'parallel-item');
    const head = el('div', 'parallel-head');

    const differing = PILLAR_LABELS
      .filter(([key]) => {
        const a = base.chart.pillars[key];
        const b = outcome.chart.pillars[key];
        return (a ? a.text : '—') !== (b ? b.text : '—');
      })
      .map(([key]) => PILLAR_NAME[key]);

    // Naming the row by what differs from the base is only meaningful for the
    // alternatives; the base row is named by what it is — the recorded time.
    head.append(el('span', null,
      outcome.containsRecorded ? '記録どおりの時刻' : `${differing.join('・') || '同じ命式'} が変わる`));
    head.append(el('span', 'parallel-share',
      `幅のうち ${naturalFrequency(outcome.fraction)}`));
    item.append(head);

    const text = PILLAR_LABELS
      .map(([key]) => (outcome.chart.pillars[key] ? outcome.chart.pillars[key].text : '—'))
      .join(' ');
    item.append(el('div', 'parallel-pillars', text));
    list.append(item);
  }
  return list;
}

/* --- solar term register (§5.1: 朱 is spent only on ingress times) -------- */

export function buildTermElement(chart) {
  const section = el('section', 'section');
  section.append(el('h2', null, '節入り'));

  const { period } = chart.pillars;
  const table = el('table');
  const body = el('tbody');

  // The two ingresses that bracket the birth, with the month branch they imply
  // between them. The governing 立春 is labelled by its role, not just by name:
  // near 立春 it is a different instant from the "next 節" row above and showing
  // both as plain "立春" reads as a contradiction.
  const rows = [
    [`直前の節　${period.term.name}（黄経 ${period.term.longitude}°）`, formatJst(period.start, true), true],
    ['　　→ 月支', chart.pillars.month.branchChar, false],
    [`次の節　${period.next.name}（黄経 ${period.next.longitude}°）`, formatJst(period.end, true), true],
    ['出生時の太陽黄経', `${period.longitude.toFixed(4)}°`, false],
    [`年柱の起点となった立春（${chart.pillars.solarYear}年）`, formatJst(chart.pillars.risshun, true), true],
  ];

  for (const [label, value, cinnabar] of rows) {
    const tr = el('tr');
    tr.append(el('th', null, label));
    const td = el('td', cinnabar ? 'num ingress' : 'num');
    td.textContent = value;
    tr.append(td);
    body.append(tr);
  }
  table.append(body);
  section.append(table);

  // The evocative fact, when there is one: proximity to an ingress reads well
  // and is honest — the error bar is information, not a weakness.
  const beforeNext = (period.end - chart.time.ut) * 1440;
  const afterStart = (chart.time.ut - period.start) * 1440;
  const nearest = Math.min(beforeNext, afterStart);
  if (nearest < 1440) {
    const isBefore = beforeNext <= afterStart;
    const line = el('p', 'hint');
    line.textContent = isBefore
      ? `あなたの誕生は、${period.next.name}の${describeSpan(beforeNext)}前。`
      : `あなたの誕生は、${period.term.name}の${describeSpan(afterStart)}後。`;
    section.append(line);
  }
  return section;
}

/* --- axes (§4.2) --------------------------------------------------------- */

export function buildAxesElement(analysis) {
  const section = el('section', 'section');
  section.append(el('h2', null, '流派で割れる軸'));

  for (const entry of analysis) {
    const details = el('details', `axis ${entry.changes ? 'live' : 'stable'}`);
    const summary = el('summary', 'axis-summary');
    summary.append(el('span', 'axis-name', entry.axis.label));
    summary.append(el('span', 'axis-state',
      entry.changes ? '命式が変わる' : '変わらない'));
    details.append(summary);

    const detail = el('div', 'axis-detail');
    if (!entry.changes) {
      detail.append(el('p', 'hint', 'この軸では、あなたの命式は変わりません。'));
    } else {
      for (const alt of entry.alternatives) {
        const block = el('div', 'axis-option');
        block.append(el('div', 'axis-option-name',
          `${alt.option.label}（${alt.option.note}）にすると`));
        if (alt.changed.length === 0) {
          block.append(el('div', 'hint', 'この組み合わせでは変わらない。'));
        } else {
          for (const change of alt.changed) {
            const row = el('div', 'axis-change');
            row.append(el('span', 'axis-option-name', `${change.label} `));
            row.append(el('span', 'from', change.from));
            row.append(el('span', 'arrow', '→'));
            row.append(el('span', 'to', change.to));
            block.append(row);
          }
        }
        detail.append(block);
      }
      details.open = true;
    }
    details.append(detail);
    section.append(details);
  }
  return section;
}

/* --- error budget (§2.6) ------------------------------------------------- */

export function buildBudgetElement(chart, precisionMinutes, deltaT) {
  const section = el('section', 'section');
  section.append(el('h2', null, '誤差予算'));

  const table = el('table');
  const body = el('tbody');
  const rows = [
    ['天体暦の精度', '秒角未満', false],
    ['ΔT', `${deltaT.toFixed(0)} 秒`, false],
    ['均時差', `${signedMinutes(chart.time.equationMinutes, 1)}（補正済み）`, false],
    ['地方時差', `${signedMinutes(chart.time.meridianMinutes, 1)}（補正済み）`, false],
    ['出生時刻の記録精度',
      precisionMinutes === null ? '不明' : `±${precisionMinutes} 分`, true],
  ];
  for (const [label, value, dominant] of rows) {
    const tr = el('tr', dominant ? 'dominant' : null);
    tr.append(el('th', null, label));
    tr.append(el('td', 'num', value));
    body.append(tr);
  }
  table.append(body);
  section.append(table);
  section.append(el('p', 'hint',
    '支配的な誤差は人間の側にある。天文計算をどれだけ磨いても、母子手帳の分解能は超えられない。'));
  return section;
}

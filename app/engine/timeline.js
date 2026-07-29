/**
 * 時の欄 — the same question asked at four zoom levels.
 *
 * 大運 answers it in decades, 年運 in years, 月運 in months, 日運 in days: is
 * what is coming round the element this chart needs, or the one that drains it?
 * Putting them in one column is the point. A bad day inside a good decade is a
 * different fact from a bad day inside a bad decade, and a reader can only see
 * which one they are in if the scales are shown together.
 *
 * The pillars for now are built by the same engine as the natal chart — same
 * 立春 boundary for the year, same 節入り boundary for the month, same local
 * apparent midnight for the day. A daily fortune computed on the civil calendar
 * while the natal chart uses solar terms would disagree with itself a dozen
 * times a year.
 */

import { buildChart, DEFAULT_AXES } from './chart.js';
import { yearFit } from './strength.js';
import { cycleAtAge, ageNow } from './luck.js';
import { ELEMENT_PLAIN } from './plainwords.js';

const FIT_LABEL = { needed: '追い風', avoided: '向かい風', neutral: '平' };

/**
 * The four scales, outermost first.
 * `luck` may be null when no sex was given; the row is then simply absent
 * rather than filled with a guess.
 */
export function timeline(input, strength, luck, now = new Date()) {
  // "Now" as a chart, at the same longitude, so the boundaries match the natal
  // reading rather than the civil calendar.
  const nowChart = buildChart({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    precision: 'pm5',
    longitude: input.longitude,
  }, DEFAULT_AXES);

  const rows = [];

  if (luck) {
    const age = ageNow(input, now);
    const current = cycleAtAge(luck, age);
    if (current) {
      rows.push({
        scale: '10年',
        when: `${current.fromAge}〜${current.toAge}歳`,
        pillar: current.pillar,
        fit: current.fit,
        key: `tl:luck:${current.fit}`,
      });
    }
  }

  for (const [scale, when, pillar] of [
    ['今年', `${nowChart.pillars.solarYear}年`, nowChart.pillars.year],
    ['今月', `${nowChart.pillars.period.term.name}から`, nowChart.pillars.month],
    ['今日', `${now.getMonth() + 1}月${now.getDate()}日`, nowChart.pillars.day],
  ]) {
    rows.push({
      scale,
      when,
      pillar,
      fit: yearFit(strength, pillar.stemElement),
      key: `tl:${scale}:${yearFit(strength, pillar.stemElement)}`,
    });
  }

  return { rows, nowChart };
}

/**
 * One sentence over the whole column.
 *
 * The useful reading is not "today is bad" but how today sits inside the larger
 * scales, so that is what this says.
 */
export function summariseTimeline(rows) {
  const today = rows.find((r) => r.scale === '今日');
  const wider = rows.filter((r) => r.scale !== '今日');
  const el = (e) => ELEMENT_PLAIN[e].name;

  if (!today) return null;
  const good = wider.filter((r) => r.fit === 'needed').length;
  const bad = wider.filter((r) => r.fit === 'avoided').length;

  let text = `今日は${el(today.pillar.stemElement)}の日で、あなたには**${FIT_LABEL[today.fit]}**です。`;

  if (today.fit === 'avoided' && bad > good) {
    text += `\n\nただ、上の段もそろって向かい風です。今日だけの問題ではないので、`
      + `今日の不調を今日のせいにしないほうがいいです。長い向かい風の中の一日です。`;
  } else if (today.fit === 'avoided' && good > bad) {
    text += `\n\nただし大きい流れのほうは追い風です。一日単位の不調は、`
      + `そのまま長期の不調にはなりません。今日は無理をしない、で足ります。`;
  } else if (today.fit === 'needed' && bad > good) {
    text += `\n\n大きい流れは向かい風なので、今日のような日を拾っていく形になります。`
      + `動くならこういう日です。`;
  } else if (today.fit === 'needed') {
    text += `\n\n上の段も追い風です。重なっている日なので、動かすなら今日です。`;
  } else {
    text += `\n\n特に押しも引きもない日です。決めたことをそのまま進める日として使えます。`;
  }
  return text;
}

export { FIT_LABEL };

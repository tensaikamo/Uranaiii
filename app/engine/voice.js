/**
 * 語り — the reading, in plain modern Japanese.
 *
 * Structure is the order a reading is delivered in:
 *   名前 → 結論 → なぜ → どんな人か → 今年 → どうするか
 *
 * Register is the thing the earlier drafts got wrong. They were written in a
 * literary voice with the jargon left bare on screen, and a reader who had
 * never opened a 四柱推命 book could not tell what they were being told. All
 * user-facing wording now lives in plainwords.js and follows one rule: say it
 * the way you would say it to a friend. The technical term follows in small
 * brackets; it never leads.
 *
 * What keeps this from being a Barnum machine:
 *   - every passage is keyed to specific characters and carries its sources;
 *   - the imagery for the ten stems is the received 十干の象, not invented here;
 *   - every passage carries its measured frequency ("42人に1人"), so a line
 *     that feels uncanny can be checked against how many people share it.
 */

import { ELEMENTS, elementBalance, pillarFromIndex } from './pillars.js';
import { judgeStrength, yearFit } from './strength.js';
import { luckPeriods, cycleAtAge, ageNow } from './luck.js';
import { ELEMENT_PLAIN, VERDICT_PLAIN, STEM_PLAIN } from './plainwords.js';
import { governingRisshun } from './terms.js';
import { calendarDate } from './swe.js';

const name = (e) => ELEMENT_PLAIN[e].name;
const doing = (e) => ELEMENT_PLAIN[e].doing;

/** The season a month branch names. */
const SEASON_OF_BRANCH = {
  寅: '春', 卯: '春', 辰: '春',
  巳: '夏', 午: '夏', 未: '夏',
  申: '秋', 酉: '秋', 戌: '秋',
  亥: '冬', 子: '冬', 丑: '冬',
};

/** The name a reader leaves with. 季節 × 十干の象 — forty of them. */
export function typeName(chart) {
  const day = chart.pillars.day;
  const season = SEASON_OF_BRANCH[chart.pillars.month.branchChar];
  const stem = STEM_PLAIN[day.stemChar];
  return {
    name: `${season}の${stem.image}`,
    tag: `${season}生まれの、${stem.tag}`,
    season,
    source: [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`, `season:${season}`],
    key: `type:${season}:${stem.image}`,
  };
}

/* --- 結論 ---------------------------------------------------------------- */

function verdictPassage(chart, strength) {
  const day = chart.pillars.day;
  const plain = VERDICT_PLAIN[strength.verdict];
  const season = SEASON_OF_BRANCH[chart.pillars.month.branchChar];

  const body = {
    weak: `あなたの本体は「${day.stemChar}」で、${name(strength.dayElement)}のグループです。生まれたのが${season}なので、まわりの力に削られる側に立っています。つまり、放っておくと消耗しやすい配置です。`
      + `\n\nこれは「弱い」という意味ではありません。ひとりで全部やろうとすると先に燃料が切れる、というだけです。味方と居場所を先に作ってから動くと、同じ力でも結果がまるで変わります。`,
    strong: `あなたの本体は「${day.stemChar}」で、${name(strength.dayElement)}のグループです。生まれたのが${season}で、まわりからも力を足されています。つまり、エネルギーが余りやすい配置です。`
      + `\n\n余った力は、出さないと行き場がありません。溜め込むほど扱いにくくなるので、使い道を持っているかどうかで生きやすさが変わります。`,
    neutral: `あなたの本体は「${day.stemChar}」で、${name(strength.dayElement)}のグループです。支える力と削る力が、ほぼ釣り合っています。`
      + `\n\nどちらにも大きく振れていないぶん、環境に引っ張られやすいタイプです。自分で選んだ場所が、そのまま強みにも弱みにもなります。`,
  }[strength.verdict];

  return {
    title: plain.headline,
    term: plain.term,
    lead: plain.oneLine,
    text: body,
    source: [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`,
      `judgement:${plain.term}`],
    key: `verdict:${strength.verdict}`,
  };
}

/** What to lean on, in things you can actually do. */
function needPassage(strength) {
  const needs = strength.needed.map((e) => `**${name(e)}**：${doing(e)}\n（${ELEMENT_PLAIN[e].concrete}）`);
  const avoid = strength.avoided.map((e) => doing(e)).join('／');
  return {
    title: '効くこと',
    text: `${needs.join('\n\n')}\n\nここに寄せるほど、調子が出ます。\n逆に「${avoid}」ばかりの環境は、自分で思っている以上に消耗します。ゼロにする必要はありませんが、そればかりの場所に長くいると削られます。`,
    source: strength.needed.map((e) => `needed:${name(e)}`)
      .concat(strength.avoided.map((e) => `avoided:${name(e)}`)),
    key: `need:${strength.verdict}:${strength.needed.map(name).join('')}`,
  };
}

/* --- どんな人か ----------------------------------------------------------- */

function portraitPassage(chart, strength) {
  const day = chart.pillars.day;
  const stem = STEM_PLAIN[day.stemChar];
  const tail = {
    weak: `\n\n支えが足りない側なので、この${stem.image}は、置かれる場所で見え方が大きく変わります。同じ人でも、環境しだいで別人のように見えます。`,
    strong: `\n\n支えが厚い側なので、この${stem.image}は放っておいても形が出ます。出しすぎだけが問題になります。`,
    neutral: `\n\n支えと削りが釣り合っているので、この${stem.image}はまわりの色をよく映します。`,
  }[strength.verdict];
  return {
    title: `${stem.image}のような人`,
    term: `日主 ${day.stemChar}`,
    text: stem.body + tail,
    source: [`day_stem:${day.stemChar}`, `image:${stem.image}`, `judgement:${VERDICT_PLAIN[strength.verdict].term}`],
    key: `portrait:${day.stemChar}:${strength.verdict}`,
  };
}

/** What the chart does not contain at all. */
function absencePassage(chart, strength) {
  const { counts, total } = elementBalance(chart.pillars);
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  if (missing.length === 0) return null;

  const needed = missing.filter((e) => strength.needed.includes(e));
  const head = `生年月日時から出る${total}文字の中に、${missing.map(name).join('と')}が1つもありません。`
    + `つまり「${missing.map((e) => doing(e)).join('」「')}」にあたる働きが、生まれつき手元にないということです。`;

  const tail = needed.length > 0
    ? `\n\nここが今回いちばん大事なところです。**その${needed.map(name).join('と')}が、あなたに効くもの**でもあります。`
      + `持っていないものを必要としている状態なので、気合いや性格で埋めようとしても届きません。`
      + `${needed.map((e) => ELEMENT_PLAIN[e].concrete).join('、')}——こういうものを、仕組みとして外から用意することになります。`
    : `\n\n${missing.map((e) => ELEMENT_PLAIN[e].lacking).join('。')}。必要な場面では、人に借りるか、あとから身につけることになります。`;

  return {
    title: `${missing.map(name).join('と')}がない`,
    text: head + tail,
    source: missing.map((e) => `absent:${name(e)}`).concat(`counted_total:${total}`),
    key: `absence:${missing.map(name).join('')}:${needed.length > 0 ? 'needed' : 'other'}`,
  };
}

/* --- 今年 ----------------------------------------------------------------- */

export function yearAhead(chart, strength, nowJdUt) {
  const risshun = governingRisshun(nowJdUt, 'teiki');
  const solarYear = calendarDate(risshun).year;
  const pillar = pillarFromIndex(((solarYear - 4) % 60 + 60) % 60);
  const fit = yearFit(strength, pillar.stemElement);
  const yearEl = name(pillar.stemElement);

  const body = {
    needed: `今年は${yearEl}の年です。あなたに効く${yearEl}が、外から巡ってきます。追い風の年なので、動かせば動きます。`
      + `\n\nただし向こうからは来ません。この年に置いた種のほうが、あとで効きます。`,
    avoided: `今年は${yearEl}の年です。あなたが消耗しやすい${yearEl}が、外から巡ってきます。向かい風の年で、押し返そうとするほど減ります。`
      + `\n\n悪い年、という意味ではありません。広げるのに向かない年、という意味です。削られたぶんは形になって残ります。`,
    neutral: `今年は${yearEl}の年です。あなたに効くものでも、消耗するものでもありません。`
      + `\n\n外からの追い風も向かい風も弱い年です。自分で決めたぶんだけ進みます。`,
  }[fit];

  return {
    title: `${solarYear}年は${{ needed: '追い風', avoided: '向かい風', neutral: '平年' }[fit]}`,
    term: `${solarYear}年 ${pillar.text}`,
    text: body,
    source: [`day_stem:${chart.pillars.day.stemChar}`, `year_pillar:${pillar.text}`,
      `judgement:${VERDICT_PLAIN[strength.verdict].term}`, `fit:${fit}`],
    key: `year:${fit}`,
    fit,
    pillar,
    solarYear,
  };
}

/* --- 大運 — the first thing that can say *when* --------------------------- */

function luckPassage(chart, strength, input, luck) {
  if (!luck) return null;
  const age = ageNow(input);
  const current = cycleAtAge(luck, age);
  const label = { needed: '追い風', avoided: '向かい風', neutral: '平年続き' };

  // Where the wind next changes — the fact a reader is actually after.
  const nextNeeded = luck.periods.find((p) => p.fit === 'needed' && p.fromAge > age);
  const leavingAt = current && current.fit !== 'neutral'
    ? `この10年が終わるのは${current.toAge}歳。` : '';

  let body;
  if (!current) {
    body = `大運はまだ始まっていません。最初の10年が始まるのは${luck.onset.years}歳${luck.onset.months}ヶ月からです。`;
  } else {
    body = `いまは**${current.fromAge}〜${current.toAge}歳の${current.pillar.text}**。`
      + `巡っている五行は${name(current.pillar.stemElement)}で、あなたには**${label[current.fit]}**の10年です。${leavingAt}`;
  }

  if (nextNeeded) {
    body += `

次に追い風の10年が来るのは**${nextNeeded.fromAge}歳から**（${nextNeeded.pillar.text}・${name(nextNeeded.pillar.stemElement)}）。`
      + `${nextNeeded.fromAge - age}年先です。`;
  } else if (current && current.fit === 'needed') {
    body += `

いまがその追い風です。`;
  } else {
    body += `

この先の表に、追い風の10年は出てきません。年ごとの巡り（今年の欄）のほうで拾っていく形になります。`;
  }

  return {
    title: '10年ごとの流れ',
    term: luck.direction === 'forward' ? '大運・順行' : '大運・逆行',
    text: body,
    source: [`month_pillar:${chart.pillars.month.text}`,
      `direction:${luck.direction === 'forward' ? '順行' : '逆行'}`,
      `立運:${luck.onset.years}歳${luck.onset.months}ヶ月`,
      ...(current ? [`current:${current.pillar.text}`, `fit:${current.fit}`] : [])],
    key: `luck:${current ? current.fit : 'before'}`,
    luck,
    current,
    age,
  };
}

/* --- どうするか ----------------------------------------------------------- */

function advicePassages(strength, year) {
  return [
    {
      title: '身の置き方',
      text: `「${strength.needed.map((e) => doing(e)).join('」と「')}」——これが手に入る場所を選ぶこと。`
        + `${VERDICT_PLAIN[strength.verdict].headline}の人は、どれだけ頑張るかより、**どこで頑張るか**で結果が変わります。`,
      source: strength.needed.map((e) => `needed:${name(e)}`)
        .concat(`judgement:${VERDICT_PLAIN[strength.verdict].term}`),
      key: `advicePlace:${strength.verdict}`,
    },
    {
      title: '今年の使い方',
      text: {
        needed: '追い風の年は、広げるほうに使ってください。守りに入ると、この年が持ってきたものを取りこぼします。',
        avoided: '向かい風の年は、広げるより整えるほうに使ってください。新しく始めるより、いま持っているものの形を決める年です。',
        neutral: '外の力が弱い年なので、自分の予定がそのまま結果になります。決めたことを、決めたとおりに置いていってください。',
      }[year.fit],
      source: [`fit:${year.fit}`, `year_pillar:${year.pillar.text}`],
      key: `adviceYear:${year.fit}`,
    },
  ];
}

/* --- assembly ------------------------------------------------------------- */

export function speak(chart, nowJdUt, input = {}) {
  const strength = judgeStrength(chart.pillars);
  const year = yearAhead(chart, strength, nowJdUt);
  const luck = luckPeriods(chart, strength, input.sex);
  return {
    strength,
    luck: luckPassage(chart, strength, input, luck),
    type: typeName(chart),
    verdict: verdictPassage(chart, strength),
    need: needPassage(strength),
    portrait: portraitPassage(chart, strength),
    absence: absencePassage(chart, strength),
    year,
    advice: advicePassages(strength, year),
  };
}

/** Every passage, flattened — for the anti-Barnum measurement. */
export function voiceStatements(chart, nowJdUt, input = {}) {
  const v = speak(chart, nowJdUt, input);
  return [v.type, v.verdict, v.need, v.portrait, v.absence, v.year, v.luck, ...v.advice]
    .filter((s) => s && Array.isArray(s.source) && s.source.length > 0);
}

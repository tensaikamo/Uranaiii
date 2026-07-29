/**
 * 語り — the reading in the traditional voice.
 *
 * This file does what app/engine/reading.js refuses to do: it judges, names,
 * advises, and reads the year. That is why it lives behind its own page and
 * never touches the chart page.
 *
 * It is built around two things the first draft was missing, and their absence
 * is exactly why that draft told the reader nothing:
 *
 *   1. **A verdict.** 身強 or 身弱, and therefore 用神 — the element the chart
 *      needs. This is what a four-pillars reading turns on; without it you have
 *      a pile of true, unconnected observations. Every passage hangs off it.
 *
 *   2. **A name.** 天星術 works because a reader leaves with "I am a 満月".
 *      Four pillars already owns the raw material — the 十干の象 (甲 the
 *      standing tree, 辛 the polished stone, 壬 the open sea) and the season of
 *      the month branch. Crossed, they give 40 named types, each derived
 *      entirely from the board: 夏の珠玉, 冬の大樹.
 *
 * Order is the order a reading is delivered in:
 *   名前 → 結論 → なぜ → どういう人か → 今年 → どうするか
 *
 * On 統計学: systems in this genre routinely claim a statistical basis and then
 * show no numbers. This one shows them. Every passage, and the type name
 * itself, carries a frequency measured over 20,000 charts (rarity.js), so a
 * line that feels uncannily personal can be checked against how many people
 * share it. That is the claim actually kept rather than merely made.
 */

import { ELEMENTS, ELEMENT_NAMES, elementBalance, pillarFromIndex } from './pillars.js';
import { judgeStrength, yearFit } from './strength.js';
import { governingRisshun } from './terms.js';
import { calendarDate } from './swe.js';

const el = (e) => ELEMENT_NAMES[e];

/** 十干の象 — the received imagery of the ten stems. */
const STEM_IMAGE = {
  甲: { image: '大樹', body: 'まっすぐ天へ伸びる木。曲がることを知らず、支えを求めず、上へ伸びることでしか自分を確かめられない。折れるとしたら、しなわなかったからだ。' },
  乙: { image: '蔓草', body: '巻きつき、しなり、隙間を縫って伸びる草。強く見えないことを選び、そのぶん折れない。まっすぐでないことは、弱さではなく戦い方だ。' },
  丙: { image: '太陽', body: '隠すことのできない火。照らす相手を選ばず、自分の熱を勘定しない。近づく者は明るくなり、本人はいつも少し焼けている。' },
  丁: { image: '灯火', body: '手元を照らす小さな火。全体ではなく、目の前の一人を温める。風には弱い。守られている間だけ、驚くほど遠くまで届く。' },
  戊: { image: '山', body: '動かない土。押しても退かず、崩さない限り形を変えない。頼られることに慣れていて、頼ることには慣れていない。' },
  己: { image: '田土', body: '耕される土。自分が実るのではなく、何かが実るために自分を差し出す。踏まれることと育てることが、同じ一つの働きになっている。' },
  庚: { image: '刀', body: '打たれて形になる金。断つことを恐れず、曖昧さを嫌う。鋭さは生まれつきではなく、叩かれた回数のぶんだけある。' },
  辛: { image: '珠玉', body: '磨かれて光る金。粗いままでは価値にならず、削られることで初めて自分になる。細部に厳しいのは、自分がそう扱われてきたからだ。' },
  壬: { image: '大海', body: '止まらない水。深さを見せず、器に応じて形を変え、どこへでも流れていく。留まれと言われることが、いちばん堪える。' },
  癸: { image: '雨露', body: '染み込む水。音を立てず、低いところへ行き、気づかれないうちに行き渡っている。目立つ働きをしないので、働いていないと誤解される。' },
};

/** The season a month branch names. 寅卯辰 spring, 巳午未 summer, and so on. */
const SEASON_OF_BRANCH = {
  寅: '春', 卯: '春', 辰: '春',
  巳: '夏', 午: '夏', 未: '夏',
  申: '秋', 酉: '秋', 戌: '秋',
  亥: '冬', 子: '冬', 丑: '冬',
};

/** What leaning on an element looks like in a life, not in a diagram. */
const ELEMENT_AS_LIFE = {
  wood: { short: '始めること', long: '新しく始める場、育てる相手、学びの場。伸びしろのあるほうへ身を置くこと' },
  fire: { short: '表に出ること', long: '人前に出る機会、発信、明るい場所、人と会う予定。隠れていると効きめが出ない' },
  earth: { short: '土台を持つこと', long: '所属、住まい、蓄え、続けている習慣。動かないものを一つ持つこと' },
  metal: { short: '決めること', long: '締切、基準、専門技術、磨く対象。曖昧なまま置かないこと' },
  water: { short: '動くこと・知ること', long: '移動、対話、情報、流れのある場所。溜め込まず巡らせること' },
};

/**
 * The type name — the thing a reader leaves with.
 * 季節 × 十干の象, both taken straight off the board. Forty of them.
 */
export function typeName(chart) {
  const day = chart.pillars.day;
  const season = SEASON_OF_BRANCH[chart.pillars.month.branchChar];
  const image = STEM_IMAGE[day.stemChar];
  return {
    name: `${season}の${image.image}`,
    season,
    image: image.image,
    stem: day.stemChar,
    source: [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`, `season:${season}`],
    key: `type:${season}:${image.image}`,
  };
}

/* --- 結論 ---------------------------------------------------------------- */

function verdictPassage(chart, strength) {
  const day = chart.pillars.day;
  const meaning = {
    weak: `日主の${el(strength.dayElement)}を支えるものが、盤の中で足りていない。自分ひとりで押し切る形ではなく、支えと味方を先に用意してから動く配置だ。無理が利かないのではなく、無理の利かせ方が違う。`,
    strong: `日主の${el(strength.dayElement)}が、盤の中で強く立っている。足すより出すほうへ回す配置で、抱えたまま強くなっても行き場が無い。使う先を持っているかどうかで、生き心地がまるく変わる。`,
    neutral: `日主の${el(strength.dayElement)}を支えるものと削るものが、ほぼ釣り合っている。どちらかに大きく振れていないぶん、環境の側に引っ張られやすい。自分で選んだ場が、そのまま強さにも弱さにもなる。`,
  }[strength.verdict];

  return {
    title: strength.label,
    lead: `要るのは ${strength.needed.map(el).join('と')}。`,
    text: meaning,
    source: [
      `day_stem:${day.stemChar}`,
      `month_branch:${chart.pillars.month.branchChar}`,
      `judgement:${strength.label}`,
    ],
    key: `verdict:${strength.verdict}`,
  };
}

/** What leaning on the needed elements actually means to do. */
function needPassage(strength) {
  const parts = strength.needed.map((e) => `${el(e)}は${ELEMENT_AS_LIFE[e].long}`);
  return {
    title: `用神 — ${strength.needed.map(el).join('・')}`,
    text: `${parts.join('。')}。ここに寄せるほど盤は釣り合いに近づく。逆に ${strength.avoided.map(el).join('・')} に偏る場は、当人が思うより消耗する。`,
    source: strength.needed.map((e) => `needed:${el(e)}`)
      .concat(strength.avoided.map((e) => `avoided:${el(e)}`)),
    key: `need:${strength.verdict}:${strength.needed.map(el).join('')}`,
  };
}

/* --- どういう人か --------------------------------------------------------- */

function portraitPassage(chart, strength) {
  const day = chart.pillars.day;
  const image = STEM_IMAGE[day.stemChar];
  const tail = {
    weak: `支えが足りない側なので、この${image.image}は、置かれる場所で見え方が大きく変わる。`,
    strong: `支えの厚い側なので、この${image.image}は、放っておいても形が出る。出しすぎが唯一の問題になる。`,
    neutral: `支えと削りが釣り合っているので、この${image.image}は、周りの色をよく映す。`,
  }[strength.verdict];
  return {
    title: `日主 ${day.stemChar} — ${image.image}`,
    text: `${image.body}${tail}`,
    source: [`day_stem:${day.stemChar}`, `image:${image.image}`, `judgement:${strength.label}`],
    key: `portrait:${day.stemChar}:${strength.verdict}`,
  };
}

/** What the board is missing entirely, in life terms. */
function absencePassage(chart, strength) {
  const { counts, total } = elementBalance(chart.pillars);
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  if (missing.length === 0) return null;

  const isNeeded = missing.filter((e) => strength.needed.includes(e));
  const head = `${total}字を数えて、${missing.map(el).join('と')}が一字も無い。`;
  const tail = isNeeded.length > 0
    ? `しかもその${isNeeded.map(el).join('と')}は、この盤が必要としているものだ。持っていないものを必要とする配置なので、性格で補おうとしても届かない。外から、仕組みとして取りに行くことになる。`
    : `${missing.map((e) => ELEMENT_AS_LIFE[e].short).join('と')}にあたる働きが、生まれつき手元に無い。必要な場面では、借りるか、後から身につけることになる。`;

  return {
    title: `${missing.map(el).join('・')}が無い`,
    text: head + tail,
    source: missing.map((e) => `absent:${el(e)}`).concat(`counted_total:${total}`),
    key: `absence:${missing.map(el).join('')}:${isNeeded.length > 0 ? 'needed' : 'other'}`,
  };
}

/* --- 今年 ----------------------------------------------------------------- */

export function yearAhead(chart, strength, nowJdUt) {
  const risshun = governingRisshun(nowJdUt, 'teiki');
  const solarYear = calendarDate(risshun).year;
  const pillar = pillarFromIndex(((solarYear - 4) % 60 + 60) % 60);
  const fit = yearFit(strength, pillar.stemElement);

  const body = {
    needed: `年の干は${pillar.stemChar}、${el(pillar.stemElement)}。この盤が必要としている五行が巡る年だ。追い風の側で、動かせば動く。待っていても向こうからは来ないので、この年に置いた種のほうが後で効く。`,
    avoided: `年の干は${pillar.stemChar}、${el(pillar.stemElement)}。この盤が苦手とする五行が巡る年だ。向かい風の側で、押し返そうとするほど減る。守るというより、削られる場所を自分で選ぶ年になる。`,
    neutral: `年の干は${pillar.stemChar}、${el(pillar.stemElement)}。用神でも忌神でもない五行が巡る年だ。外からの追い風も向かい風も弱く、自分で決めたぶんだけ進む。`,
  }[fit];

  return {
    title: `${solarYear}年 ${pillar.text} — ${{ needed: '追い風', avoided: '向かい風', neutral: '平' }[fit]}`,
    text: body,
    source: [`day_stem:${chart.pillars.day.stemChar}`, `year_pillar:${pillar.text}`,
      `judgement:${strength.label}`, `fit:${fit}`],
    key: `year:${fit}`,
    fit,
    pillar,
    solarYear,
  };
}

/* --- どうするか ----------------------------------------------------------- */

function advicePassages(strength, year) {
  return [
    {
      title: '置く場所',
      text: `${strength.needed.map((e) => ELEMENT_AS_LIFE[e].short).join('と')}——それが手に入る場に身を置くこと。${strength.label}の盤では、努力の量より、どこで努力するかのほうが結果を分ける。`,
      source: strength.needed.map((e) => `needed:${el(e)}`).concat(`judgement:${strength.label}`),
      key: `advicePlace:${strength.verdict}`,
    },
    {
      title: '今年の構え',
      text: {
        needed: '追い風の年は、広げるほうに使う。守りに入ると、この年が持ってきたものを取りこぼす。',
        avoided: '向かい風の年は、広げるより整えるほうに使う。この年に削られたぶんは、形になって残る。',
        neutral: '外の力が弱い年は、自分の予定がそのまま結果になる。決めたことを、決めた通りに置いていくこと。',
      }[year.fit],
      source: [`fit:${year.fit}`, `year_pillar:${year.pillar.text}`],
      key: `adviceYear:${year.fit}`,
    },
  ];
}

/* --- assembly ------------------------------------------------------------- */

export function speak(chart, nowJdUt) {
  const strength = judgeStrength(chart.pillars);
  const year = yearAhead(chart, strength, nowJdUt);
  return {
    strength,
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
export function voiceStatements(chart, nowJdUt) {
  const v = speak(chart, nowJdUt);
  return [v.type, v.verdict, v.need, v.portrait, v.absence, v.year, ...v.advice]
    .filter((s) => s && Array.isArray(s.source) && s.source.length > 0);
}

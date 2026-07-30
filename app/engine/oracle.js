/**
 * 託宣 — the same chart, spoken the way a reading is spoken.
 *
 * The board page states what is there. The 語り page explains it in plain modern
 * Japanese. Both were built against one fear — that a reader would be moved by
 * something that was not true — and both pay for it the same way: they hedge
 * every few sentences, and hedging every few sentences is how you tell somebody
 * "do not take this seriously" while asking them to take it seriously.
 *
 * That is a real cost and it was worth naming. A reading is not only a report.
 * People come to one to be *addressed*, and the register is doing half the work:
 * the pause, the imperative, the line that stops short. Strip those out and what
 * arrives is a health check-up.
 *
 * So this page gives them back — and gives back nothing else.
 *
 * **What changes here: the voice. What does not change: the facts.**
 *
 *   - Every line is still derived from the computed chart. Nothing is invented,
 *     nothing is random, the same birth always speaks the same words.
 *   - 文語 flavour, imperatives, 体言止め, aphorism. The things plainwords.js
 *     bans on purpose, because this is the page they belong on.
 *   - **The caution is said once, at the entrance, and then never again.**
 *     Not because it stopped being true, but because a warning repeated inside
 *     every sentence is not honesty — it is a way of having it both ways. Say it
 *     plainly, once, and then commit to the voice.
 *   - Sources are kept, and folded to the bottom. A reader who wants to take the
 *     thing apart still can; a reader who wants to be spoken to is not made to
 *     step over the machinery to get there.
 *
 * The line this file will not cross: it never states a future event as fact, and
 * it never says anything the chart did not produce. "Vague and moving" is a
 * register. "Made up" is a lie, and the difference is the whole point.
 */

import { ELEMENTS, elementBalance } from './pillars.js';
import { godGroups, GROUP_PLAIN } from './tenGods.js';

const EL = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

/** The season a month branch names. */
const SEASON_OF = {
  寅: '春', 卯: '春', 辰: '春',
  巳: '夏', 午: '夏', 未: '夏',
  申: '秋', 酉: '秋', 戌: '秋',
  亥: '冬', 子: '冬', 丑: '冬',
};

/**
 * 十干 — the received images, said as images.
 *
 * `plainwords.js` has the same ten explained ("大きな木のような人です"). These are
 * the same ten *invoked*. Nothing here claims anything the plain version does
 * not; it declines to soften.
 */
const STEM = {
  甲: { name: '大樹', open: '天へ伸びるほかに、育ち方を知らぬ木。', turn: '曲がれぬことを、あなたはずっと不器用だと思ってきた。それは背丈のことだ。' },
  乙: { name: '蔓草', open: '正面を避け、隙間から陽へ至る草。', turn: 'まっすぐでないことを恥じるな。折れずに済んだのは、そのためだ。' },
  丙: { name: '太陽', open: '相手を選ばず照らし、選ばずに焼く光。', turn: 'あなたが明るいとき、あなたは減っている。それを誰も見ていない。' },
  丁: { name: '灯火', open: '部屋ぜんぶは無理でも、向かいの一人は温める火。', turn: '風の当たる場所に立つな。守られた場所でだけ、あなたの火は遠くまで届く。' },
  戊: { name: '山', open: '押されても動かぬもの。動かぬことが役目であるもの。', turn: '頼られ慣れた者ほど、頼り方を知らぬ。あなたのことだ。' },
  己: { name: '畑の土', open: '自らは実らず、実る場所を差し出す土。', turn: '踏まれることと育てることが、あなたの中では同じ働きだ。' },
  庚: { name: '刀', open: '曖昧を嫌い、断つことをためらわぬ刃。', turn: 'その鋭さは生まれつきではない。叩かれた回数のぶんだけある。' },
  辛: { name: '宝石', open: '原石のままでは値のつかぬもの。削られて、はじめて名を得るもの。', turn: '細部に厳しいのは、あなたがそう扱われてきたからだ。' },
  壬: { name: '大海', open: '深さを見せず、器に合わせて形を変え、どこへでも流れる水。', turn: '「ここに留まれ」——その一言が、あなたにはいちばんこたえる。' },
  癸: { name: '雨', open: '音を立てず、低きへ行き、気づかれぬうちに行き渡る雨。', turn: '派手に働かぬゆえ、働いておらぬと誤解される。それでも土は湿っている。' },
};

/** The season, as weather rather than as a date range. */
const SEASON = {
  春: '芽の季',
  夏: '燃える季',
  秋: '刈り取る季',
  冬: '蔵う季',
};

/** 身強・身弱, declared. */
const VERDICT = {
  weak: {
    line: 'あなたは、削られる側に生まれた。',
    body: '与える力より、与えられねばならぬ力のほうが多い。\nひとりで背負えば、荷が尽きる前にあなたが尽きる。',
    turn: 'これは弱さの札ではない。ひとりで立つなという指示だ。',
  },
  strong: {
    line: 'あなたは、余る側に生まれた。',
    body: '押し返す力が、押される力を上回っている。\n出す先を持たぬ余力は、内へ向かって荒れる。',
    turn: '使い道を持て。持たぬ強さは、持ち主を削る。',
  },
  neutral: {
    line: 'あなたは、どちらにも傾かぬ位置に生まれた。',
    body: '助ける力と削る力が、ほとんど釣り合っている。\nゆえに、置かれた場所の色をそのまま帯びる。',
    turn: '選んだ場所が、そのままあなたの性質になる。選ぶことが、あなたの才だ。',
  },
};

/** 用神 — said as an instruction, because that is what it is. */
const SEEK = {
  wood: { order: '木を求めよ。', how: '新しきに手をつけよ。学べ。誰かを育てよ。\n伸びる先があるとき、あなたは伸びる。' },
  fire: { order: '火を求めよ。', how: '人前へ出よ。名乗れ。見せよ。\n隠れている限り、あなたは数えられない。' },
  earth: { order: '土を踏め。', how: '動かぬ居場所を持て。貯めよ。続けよ。\n根の張らぬ場所で、あなたは実らない。' },
  metal: { order: '金を鳴らせ。', how: '決めよ。期限を切れ。要らぬものを断て。\n曖昧を残すたび、あなたは重くなる。' },
  water: { order: '水を通せ。', how: '動け。調べよ。人に話せ。\n淀ませた分だけ、あなたは濁る。' },
};

/** 欠け — an absence, named as absence. */
const ABSENT = {
  wood: '木が無い。\n始まりは、あなたの外から来る。待つのではなく、借りよ。',
  fire: '火が無い。\nあなたは、居るのに数えられぬことがある。声は自分で上げるほかない。',
  earth: '土が無い。\n入ってきたものが留まらぬ。器は、自分で用意せねばならぬ。',
  metal: '金が無い。\n断てぬまま持ち越したものが、静かに積み上がっている。',
  water: '水が無い。\n溜めたものを自分では動かせぬ。流してくれる者を探せ。',
};

/** 通変星の群れ — who stands around you. */
const AROUND = {
  peer: '盤には、あなたと同じ丈の者が立っている。競う相手であり、並ぶ相手である。',
  output: '盤には、外へ出ていくものが多い。作る手、話す口、差し出すもの。',
  wealth: '盤には、掴めるものが多い。手に取り、扱い、数えられるもの。',
  office: '盤には、あなたを律するものが多い。役目、立場、断れぬ頼み。',
  resource: '盤には、あなたを支えるものが多い。教える者、庇う者、学ぶべきもの。',
};

/** 大運・流年 — the wind, stated as weather. */
const WIND = {
  needed: { now: '風は、いま背にある。', tell: '押されている。動くならこの時期だ。' },
  avoided: { now: '風は、いま正面から来る。', tell: '進まぬのではない。同じ距離に倍の力が要る、それだけのことだ。' },
  neutral: { now: '風は、いま凪いでいる。', tell: '押しも引きもない。決めたことが、決めたとおりに進む。' },
};

/** 結び — an aphorism, chosen by the verdict and what the chart wants. */
const CLOSE = {
  weak: '足りぬものを数えるな。足りぬものを、どこで借りるかを数えよ。',
  strong: '強さは持っているだけでは徳にならぬ。向ける先を決めたときに、はじめて力になる。',
  neutral: '流されるのと、選んで乗るのは、外から見れば同じ形をしている。中では違う。',
};

/** One movement of the reading. */
function line(text, source, key, kind = 'line') {
  if (!text || !source || source.length === 0) return null;
  return { text, source, key, kind };
}

/**
 * The reading.
 *
 * `luckFit` is the 大運 the reader stands in, when a sex was given. Absent, the
 * wind is simply not spoken of — the oracle does not guess at a thing the engine
 * declined to compute.
 */
export function oracle(chart, strength, { luckFit = null, yearFit = null } = {}) {
  const day = chart.pillars.day;
  const stem = STEM[day.stemChar];
  const season = SEASON_OF[chart.pillars.month.branchChar];
  const { counts } = elementBalance(chart.pillars);
  const need = strength.needed[0];
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  const groups = godGroups(chart.pillars);
  const lead = Object.keys(GROUP_PLAIN)
    .filter((g) => groups[g].length > 0)
    .sort((a, b) => groups[b].length - groups[a].length)[0] || null;

  const movements = [];
  const push = (m) => { if (m) movements.push(m); };

  /* 開き — the name, and the season it was born into. */
  push(line(
    `${SEASON[season]}の${stem.name}。`,
    [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`, `season:${season}`],
    `oracle:name:${season}:${day.stemChar}`, 'title',
  ));
  push(line(stem.open,
    [`day_stem:${day.stemChar}`, `image:${stem.name}`], `oracle:open:${day.stemChar}`));

  /* 本性 — the verdict, declared rather than diagnosed. */
  const v = VERDICT[strength.verdict];
  push(line(v.line, [`judgement:${strength.label}`], `oracle:verdict:${strength.verdict}`, 'strong'));
  push(line(v.body, [`judgement:${strength.label}`, `score:${strength.score}`],
    `oracle:verdict_body:${strength.verdict}`));
  push(line(stem.turn, [`day_stem:${day.stemChar}`], `oracle:turn:${day.stemChar}`));
  push(line(v.turn, [`judgement:${strength.label}`], `oracle:verdict_turn:${strength.verdict}`));

  /* 欠けたるもの — said only when something is genuinely absent. */
  for (const e of missing.slice(0, 2)) {
    push(line(ABSENT[e], [`absent:${EL[e]}`], `oracle:absent:${e}`));
  }

  /* まわり — the 通変星 the board is thickest in. */
  if (lead) {
    push(line(AROUND[lead],
      groups[lead].map((g) => g.source).concat(`god:${GROUP_PLAIN[lead].name}`),
      `oracle:around:${lead}`));
  }

  /* 求めよ — the imperative. This is the line the reading exists for. */
  push(line(SEEK[need].order, [`needed:${EL[need]}`], `oracle:order:${need}`, 'strong'));
  push(line(SEEK[need].how, [`needed:${EL[need]}`], `oracle:how:${need}`));

  /* 時 — the wind, when the engine computed one. */
  const wind = luckFit || yearFit;
  if (wind) {
    push(line(WIND[wind].now,
      [luckFit ? `luck_now:${luckFit}` : `year:${yearFit}`], `oracle:wind:${wind}`, 'strong'));
    push(line(WIND[wind].tell,
      [luckFit ? `luck_now:${luckFit}` : `year:${yearFit}`], `oracle:wind_tell:${wind}`));
  }

  /* 結び */
  push(line(CLOSE[strength.verdict], [`judgement:${strength.label}`],
    `oracle:close:${strength.verdict}`, 'close'));

  return {
    title: `${SEASON[season]}の${stem.name}`,
    movements,
  };
}

/** Every line, for the frequency table to measure. */
export function oracleStatements(chart, strength, options = {}) {
  return oracle(chart, strength, options).movements;
}

/**
 * 生活の場面ごとの読み方 — the same verdict, pointed at what a reader came for.
 *
 * The engine's conclusion is an element and a direction: "you are on the drained
 * side, lean on 金". True, sourced, and useless to somebody wondering whether to
 * take the job. What makes a personality result usable is fixed headings — work,
 * people, money, health — so you can go straight to the one you care about.
 *
 * This file is that projection. **It invents no new divination.** Every line is
 * one of four already-computed facts, restated for one of four settings:
 *
 *   用神     the element the chart needs        → what leaning on it looks like
 *   欠け     an element absent from the board   → what its absence costs
 *   判定     身強 / 中庸 / 身弱                  → the frame the setting sits in
 *   通根     whether the day master has roots   → whether staying put pays
 *
 * Anti-Barnum rules, unchanged from reading.js:
 *   - every bullet carries a non-empty `source[]`, and one that ends up empty is
 *     destroyed here rather than filtered downstream;
 *   - the pick is deterministic — priority order, never rotation or randomness,
 *     so the same birth always produces the same page;
 *   - every bullet has a `key`, so `frequencyOf` can tell the reader how many
 *     people got the same line. A line true of a third of everybody says so.
 *
 * Register follows plainwords.js: second person, です・ます, one idea per bullet,
 * and it has to land on something you could do this week.
 */

import { ELEMENTS, elementBalance } from './pillars.js';
import { ELEMENT_PLAIN, STEM_PLAIN, VERDICT_PLAIN } from './plainwords.js';

/** The four settings, in the order they are shown. */
export const DOMAINS = [
  { key: 'work', label: '仕事' },
  { key: 'people', label: '人づきあい・恋愛' },
  { key: 'money', label: 'お金' },
  { key: 'body', label: '心と体' },
];

/** How many bullets a single section may show. Past three it stops being scannable. */
export const MAX_PER_DOMAIN = 3;

/** 用神 — what leaning on this element actually looks like, per setting. */
const NEEDED = {
  wood: {
    work: '新しい案件や勉強に手を出しているときが伸びます。同じ作業だけだと止まります。',
    people: '新しく知り合う場に出ると流れが変わります。年下の面倒を見る役が向きます。',
    money: '自分を育てるための出費（学ぶ・道具）が、いちばん戻ってきます。',
    body: '朝に予定を入れて、外を歩く。それだけで整いやすいタイプです。',
  },
  fire: {
    work: '人前に出す仕事が効きます。裏方だけだとやった分が届きません。',
    people: '自分から誘う側になると動きます。待っていると気づかれないままです。',
    money: '人に会う・見せることに使ったお金が返ってきます。',
    body: '明るいところに出てください。閉じこもる日が続くと落ちます。',
  },
  earth: {
    work: '動かない所属と、続けている担当があると強いです。掛け持ちを増やすと薄まります。',
    people: '同じ人と長く続ける関係が効きます。広く浅くは向きません。',
    money: '先に貯める枠を決めてしまってください。残ったら貯める、では残りません。',
    body: '寝る時間と食べる時間を固定するだけで戻ります。',
  },
  metal: {
    work: '締切と基準を決めてから動くと通ります。ひとつの技術を深める方が向きます。',
    people: '言うことを決めて言ってください。曖昧にしたままだとこじれます。',
    money: '使っていないものを切ると増えます。収入を増やすより先に効きます。',
    body: 'やらないことを決めてください。予定を削るのが回復になります。',
  },
  water: {
    work: '調べる・人に聞く工程を先に置くと早いです。座って考え込むと止まります。',
    people: '会う場所を変える、間に人を入れる。それで関係が動きます。',
    money: '動かして使うお金（移動・情報）が効きます。寝かせると目減りします。',
    body: '湯に浸かる、場所を変える。同じ部屋に居続けると詰まります。',
  },
};

/** 欠け — what an element's total absence from the board costs, per setting. */
const MISSING = {
  wood: {
    work: '自分から新しいことを始めるきっかけが作りにくいです。人に振ってもらうほうが早いです。',
    people: '関係が自然には増えません。いまいる人を大事にするほうが得です。',
    money: '先に投資する判断が遅れがちです。',
    body: '立ち上がりが重い日があります。朝の予定を軽くしておいてください。',
  },
  fire: {
    work: 'やっているのに気づかれません。報告の回数を意識して増やしてください。',
    people: '自分から名乗り出るのが苦手で、いるのに数えられないことがあります。',
    money: '見せることに使うお金を惜しみがちです。',
    body: '気分が上がりにくいので、人に会う予定を先に入れておくといいです。',
  },
  earth: {
    work: '続ける担当や所属が薄いと、成果が積み上がりません。',
    people: '関係が素通りしがちです。会う頻度を先に決めてしまうといいです。',
    money: '入ってきたものが残りません。先に別の口座へ分けてください。',
    body: '生活のリズムが崩れやすいです。寝る時間だけは固定してください。',
  },
  metal: {
    work: '決めきれずに持ち越したものが溜まります。締切を人に言っておくといいです。',
    people: '断るのが苦手で、抱えすぎます。',
    money: '使うか使わないかの線が引きにくいです。上限だけ決めてください。',
    body: '予定を切れずに、限界まで詰めてしまいます。',
  },
  water: {
    work: '溜め込んだものを自分で動かすのが苦手です。人に話すと動きます。',
    people: '話が広がりにくいので、間に入ってくれる人がいると変わります。',
    money: '情報が入りにくく、条件をくらべるのを後回しにしがちです。',
    body: '切り替えが利きにくいです。場所を変えるだけで戻ります。',
  },
};

/** 判定 — the frame each setting sits in. */
const VERDICT = {
  weak: {
    work: 'ひとりで全部抱えると先に燃料が切れます。人と組む形にしてください。',
    people: '支えてくれる人を先に作ると、同じ力でも結果が変わります。',
    money: '固定費を軽くしておくほうが効きます。守りが利くタイプです。',
    body: '限界の手前のサインが出にくいので、休む日を先に決めてください。',
  },
  strong: {
    work: '任される量が多いほうが向きます。手を出す先が無いと荒れます。',
    people: '押しが強く出るので、先に聞く時間を取ると通りやすくなります。',
    money: '出し先を決めておかないと、余った分だけ動きます。',
    body: '使い切らないと眠れないタイプです。体を動かす予定を入れてください。',
  },
  neutral: {
    work: '環境に引っ張られるので、選んだ場所がそのまま実力になります。',
    people: '相手の色をよく映します。長くいる相手を選ぶのが効きます。',
    money: 'どちらにも振れます。決めた枠を守るだけで安定します。',
    body: '崩れにくいぶん、崩れたときは原因が環境の側にあります。',
  },
};

/** 通根 — whether staying in one place compounds or costs. */
const ROOT = {
  rooted: {
    work: '同じ場所で積み上げると効きます。途中で動くと取り戻すのに時間がかかります。',
    people: '長い付き合いに強いです。',
    money: '同じやり方を続ける貯め方が向きます。',
    body: '戻る場所があると回復が早いです。',
  },
  rootless: {
    work: '場所を変えるほうが伸びます。留まるより動くのが向いています。',
    people: '相手や環境で見え方が大きく変わります。同じ人でも別人のように見えます。',
    money: 'ひとつの形に固定しないほうが安全です。',
    body: '環境を変えるのが、いちばん効く回復のしかたです。',
  },
};

/**
 * How many branches must hold the day master's element before "土台がある".
 *
 * Two, measured: it splits charts 61% / 39%. One branch out of four is a thin
 * root, and the advice on that side — move rather than stay — is the right one
 * for it.
 */
export const ROOTED_AT = 2;

/** 強み, graded by root count rather than by its yes/no. */
const ROOT_STRENGTH = [
  '身軽なので、環境を変えたときの立ち直りがいちばん速いタイプです。',
  '土台は細いぶん、動くのも留まるのも選べます。',
  '土台があるので、続けたものが実力として残ります。',
  '土台が厚いので、一度積んだものは環境が変わっても崩れません。',
];

/** A bullet, or nothing if it would carry no sources (spec §8.2). */
function bullet(text, source, key) {
  if (!text || !source || source.length === 0) return null;
  return { text, source, key };
}

/**
 * Bullets for each setting.
 *
 * Priority is 用神 → 欠け → 判定 → 通根: the actionable one first, then the
 * caution, then the frame. Capped, so a chart with plenty to say does not bury
 * the top of the section.
 */
export function domainBullets(chart, strength) {
  const { counts } = elementBalance(chart.pillars);
  // 用神 can name more than one element; ELEMENTS order makes the pick stable.
  const need = strength.needed[0];
  // 通根 as a yes/no is 90% "yes", which makes a statement built on it true of
  // nearly everybody — a Barnum line, and the frequency table caught it. The
  // count is a real spread (0本 10%, 1本 29%, 2本 31%, 3本 22%, 4本 8% over
  // 20,000 charts), so the split is drawn at two branches: 61% / 39%.
  const rootKey = strength.rootCount >= ROOTED_AT ? 'rooted' : 'rootless';

  // The element the chart needs is very often one it does not have — that is
  // frequently *why* it needs it. Saying "lean on 土" and then "you have no 土"
  // as two adjacent bullets states one fact twice, so the absence is folded into
  // the 用神 bullet as a flag and dropped from the missing list.
  const needIsAbsent = counts[need] === 0;
  const missing = ELEMENTS.filter((e) => counts[e] === 0 && e !== need);

  const out = {};
  for (const { key: domain, label } of DOMAINS) {
    const needBullet = bullet(NEEDED[need][domain],
      needIsAbsent
        ? [`needed:${ELEMENT_PLAIN[need].name}`, `absent:${ELEMENT_PLAIN[need].name}`, `domain:${domain}`]
        : [`needed:${ELEMENT_PLAIN[need].name}`, `domain:${domain}`],
      `domain:${domain}:needed:${need}${needIsAbsent ? ':absent' : ''}`);

    const candidates = [
      needBullet,
      ...missing.map((e) => bullet(MISSING[e][domain],
        [`absent:${ELEMENT_PLAIN[e].name}`, `domain:${domain}`], `domain:${domain}:absent:${e}`)),
      bullet(VERDICT[strength.verdict][domain],
        [`judgement:${VERDICT_PLAIN[strength.verdict].term}`, `domain:${domain}`],
        `domain:${domain}:verdict:${strength.verdict}`),
      bullet(ROOT[rootKey][domain],
        [`root_count:${strength.rootCount}`, `domain:${domain}`],
        `domain:${domain}:root:${rootKey}`),
    ].filter(Boolean);

    out[domain] = { label, bullets: candidates.slice(0, MAX_PER_DOMAIN) };
  }
  return out;
}

/**
 * The one note that belongs above all four settings rather than inside each.
 *
 * When the element the chart needs is also one it does not hold, that is a fact
 * about the whole chart, not about work or about money. Repeating it under every
 * heading was noise; it is said once, here.
 */
export function needAbsentNote(chart, strength) {
  const { counts } = elementBalance(chart.pillars);
  const need = strength.needed[0];
  if (counts[need] !== 0) return null;
  const plain = ELEMENT_PLAIN[need];
  return {
    text: `いちばん効く${plain.name}が、生まれた盤には一つもありません。`
      + '持って生まれていないぶん、自分で用意しにいく必要があります。'
      + `${plain.doing}——これが、あなたにとっては意識してやることになります。`,
    source: [`needed:${plain.name}`, `absent:${plain.name}`],
    key: `domain:need_absent:${need}`,
  };
}

/**
 * The three summary cards: what works, what trips you, what to do this week.
 *
 * Same facts again, grouped by usefulness instead of by setting. This is the
 * part a reader screenshots, so it is kept to short lines and nothing here is
 * allowed to appear without the characters it came from.
 */
export function summaryCards(chart, strength) {
  const day = chart.pillars.day;
  const stem = STEM_PLAIN[day.stemChar];
  const { counts } = elementBalance(chart.pillars);
  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  const plain = VERDICT_PLAIN[strength.verdict];

  const strengths = [
    bullet(stem.tag, [`day_stem:${day.stemChar}`, `image:${stem.image}`], `card:strength:stem:${day.stemChar}`),
    bullet({
      strong: '放っておいても形が出ます。出しすぎだけが問題になります。',
      weak: '削られる側に立っているぶん、置かれる場所を選ぶ目が育ちます。',
      neutral: 'どちらにも大きく振れないので、どんな相手とも組めます。',
    }[strength.verdict], [`judgement:${plain.term}`], `card:strength:verdict:${strength.verdict}`),
    // Graded by how many branches hold it, not by whether any does: the yes/no
    // version was true of 89.7% of charts and read as flattery.
    bullet(ROOT_STRENGTH[Math.min(strength.rootCount, 3)],
      [`root_count:${strength.rootCount}`],
      `card:strength:roots:${Math.min(strength.rootCount, 3)}`),
  ].filter(Boolean);

  const cautions = [
    ...missing.map((e) => bullet(ELEMENT_PLAIN[e].lacking,
      [`absent:${ELEMENT_PLAIN[e].name}`], `card:caution:absent:${e}`)),
    bullet({
      strong: '力が余るので、出し先が無い時期に荒れます。',
      weak: 'ひとりで全部やろうとすると、先に燃料が切れます。',
      neutral: '環境に引っ張られるので、居場所を選び損ねると丸ごと影響します。',
    }[strength.verdict], [`judgement:${plain.term}`], `card:caution:verdict:${strength.verdict}`),
  ].filter(Boolean).slice(0, 3);

  // 用神 already carries the concrete wording; reuse it rather than write it twice.
  const actions = strength.needed
    .map((e) => bullet(`${ELEMENT_PLAIN[e].doing}（${ELEMENT_PLAIN[e].concrete}）`,
      [`needed:${ELEMENT_PLAIN[e].name}`], `card:action:${e}`))
    .filter(Boolean)
    .slice(0, 2);

  return [
    { key: 'strengths', title: '強み', mark: '✔', bullets: strengths.slice(0, 3) },
    { key: 'cautions', title: 'つまずきやすいところ', mark: '⚠', bullets: cautions },
    { key: 'actions', title: '今すぐやるなら', mark: '▶', bullets: actions },
  ];
}

/** Every bullet key on the page, for the frequency table to measure. */
export function domainStatements(chart, strength) {
  const perDomain = Object.values(domainBullets(chart, strength)).flatMap((d) => d.bullets);
  const cards = summaryCards(chart, strength).flatMap((c) => c.bullets);
  const note = needAbsentNote(chart, strength);
  return perDomain.concat(cards, note ? [note] : []);
}

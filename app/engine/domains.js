/**
 * 生活の場面ごとの読み方 — the same verdict, pointed at what a reader came for.
 *
 * The engine's conclusion is an element and a direction: "you are on the drained
 * side, lean on 金". True, sourced, and useless to somebody wondering whether to
 * take the job. What makes a personality result usable is fixed headings — work,
 * people, money, health — so you can go straight to the one you care about.
 *
 * This file is that projection. **It invents no new divination.** Every line is
 * an already-computed fact, restated for one of four settings:
 *
 *   用神     the element the chart needs        → what leaning on it looks like
 *   宮       月支 / 日支 / 時支 by 五行 relation → the pillar this setting owns
 *   欠け     an element absent from the board   → what its absence costs
 *   大運     the decade the reader stands in    → whether now is the time
 *   最多五行 what the board holds most of        → how money behaves
 *   判定     身強 / 中庸 / 身弱                  → the frame the setting sits in
 *   通根     how many branches hold the day master → whether staying put pays
 *
 * The first version of this file looked at only four of these, and it showed:
 * measured over 20,000 charts it could produce just **978 distinct bullet-sets**
 * — 14.2% of the 6,909 distinct 命式 those charts contained, and a number that
 * does not move however large the sample gets. Fewer than a thousand possible
 * readings means a thousand readers include two who get the same three lines.
 * The engine had already computed everything needed to fix that; the bullets
 * were simply not looking. Wiring the rest in takes it to **5,963 (86.3%)**
 * without a single new calculation.
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

/**
 * How many bullets a single section may show.
 *
 * Four. At three, the palace and 大運 lines added below never reached the page
 * on a chart that also had a missing element — the cap silently threw away the
 * material that was just wired in. Past four it stops being scannable.
 */
export const MAX_PER_DOMAIN = 4;

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

/**
 * 宮 — the traditional palace each pillar governs, read by its 五行 relation to
 * the day master.
 *
 * The engine already computes every branch and the day master's element; the
 * bullets simply were not looking at them. Measured over 20,000 charts, adding
 * these took the per-scene layer from 978 distinct bullet-sets to 5,963 — from
 * 14.2% of the reachable ceiling to 86.3%. Nothing new is calculated here.
 *
 * Which pillar governs what is the received allocation, not an invention:
 *   月支 社会・仕事    日支 いちばん近い人（配偶者の宮）    時支 晩年と体
 *
 * Keyed by relation rather than by the branch itself, so this is five sentences
 * per palace instead of twelve. The relation is what the reading actually turns
 * on, and twelve rushed lines would be worse writing than five considered ones.
 */
const PALACE = {
  work: {
    比和: '仕事の場は、自分と同じ性質の場になりやすい配置です。慣れるのは速いぶん、代わりも利きやすい位置にいます。',
    生我: '環境のほうが自分を押し上げてくれる配置です。入る場所さえ選べば、実力以上に伸びます。',
    我生: '自分から出していく側の配置です。成果は出ますが、出しっぱなしにすると削られます。',
    我剋: '自分が場を動かす側の配置です。手を入れるほど回りますが、人に任せるのが苦手になりがちです。',
    剋我: '締め付けの強い場に置かれやすい配置です。規律は身につきますが、窮屈さも一緒に来ます。',
  },
  people: {
    比和: 'いちばん近い人とは似た者同士になりやすい配置です。分かり合える代わりに、ぶつかると同じ強さで返ってきます。',
    生我: '近い人に支えられる配置です。頼るのが下手だと、その良さを使い損ねます。',
    我生: '近い人に与える側の配置です。世話を焼きすぎて、自分の分が無くならないように。',
    我剋: '近い人を仕切る側になりやすい配置です。良かれと思って決めすぎると、窮屈がられます。',
    剋我: '近い人に強く出られやすい配置です。合わせすぎていないか、ときどき確かめてください。',
  },
  body: {
    比和: '年を重ねても性質が変わりにくい配置です。若いころの習慣が、そのまま後半に残ります。',
    生我: '後半になるほど楽になる配置です。無理をした分の回復も利きます。',
    我生: '出し続ける後半になりやすい配置です。休む予定を先に入れておくと、まるで違います。',
    我剋: '自分で自分を管理する後半になります。決めた形を守れる人です。',
    剋我: '後半に負荷がかかりやすい配置です。早めに整える習慣を作っておくと効きます。',
  },
};

/** Which pillar's branch each setting reads. お金 has no palace; it reads the board. */
const PALACE_PILLAR = { work: 'month', people: 'day', body: 'hour' };

/** お金 — read from whichever element the board holds most of. */
const DOMINANT_MONEY = {
  wood: '木の多い盤です。増やす・広げる方向にお金が動きます。手を広げる枠だけ先に決めてください。',
  fire: '火の多い盤です。人と会う・見せる方向に出ていきます。返っては来ますが、出ていく速さのほうが上です。',
  earth: '土の多い盤です。貯める力はあるので、動かさなすぎて機会を逃すほうが問題になります。',
  metal: '金の多い盤です。締める判断は利きます。切りすぎて、必要な出費まで止めないように。',
  water: '水の多い盤です。動かして回すのが向きます。抱えて置く形にすると落ち着きません。',
};

/** いまの10年 — the 大運 the reader is standing in. */
const LUCK_NOW = {
  needed: {
    work: 'いまの10年は追い風です。動かすなら、この区間のうちです。',
    people: 'いまの10年は追い風です。人の輪を広げるのに向いた区間にいます。',
    money: 'いまの10年は追い風です。仕込んだものが効きやすい区間です。',
    body: 'いまの10年は追い風です。無理が利くぶん、利かせすぎに気をつけてください。',
  },
  avoided: {
    work: 'いまの10年は向かい風です。広げるより、守って整える区間として使ってください。',
    people: 'いまの10年は向かい風です。増やすより、いまいる人を保つほうが効きます。',
    money: 'いまの10年は向かい風です。大きく張る区間ではありません。',
    body: 'いまの10年は向かい風です。回復に時間がかかるので、休みを先に取ってください。',
  },
  neutral: {
    work: 'いまの10年は、どちらでもない区間です。追い風も向かい風も無いぶん、選んだ場所がそのまま出ます。',
    people: 'いまの10年は、どちらでもない区間です。関係は自分の動き方しだいで決まります。',
    money: 'いまの10年は、どちらでもない区間です。決めた枠を守るだけで安定します。',
    body: 'いまの10年は、どちらでもない区間です。崩れたときは、原因が生活の側にあります。',
  },
};

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

/** How another element stands to the day master. The same five terms strength.js weighs. */
function relationTo(me, other) {
  if (me === other) return '比和';
  if (GENERATES[other] === me) return '生我';
  if (GENERATES[me] === other) return '我生';
  if (CONTROLS[me] === other) return '我剋';
  return '剋我';
}

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
 * Priority is 用神 → 宮 → 欠け → 大運 → 判定 → 通根: the actionable one first,
 * then the pillar this setting actually belongs to, then the caution, then the
 * decade, then the frame. Capped, so a chart with plenty to say does not bury
 * the top of the section.
 *
 * `luckFit` is the 大運 the reader is standing in, when a sex was given. It is
 * passed rather than computed here so this file stays a projection of facts it
 * is handed, with no clock and no engine of its own.
 */
export function domainBullets(chart, strength, { luckFit = null } = {}) {
  const { counts } = elementBalance(chart.pillars);
  const me = chart.pillars.day.stemElement;
  const dominant = ELEMENTS.filter((e) => counts[e] === Math.max(...ELEMENTS.map((x) => counts[x])));
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

    // 宮 — the pillar this setting traditionally belongs to. お金 has no palace,
    // so it reads the element the board holds most of instead.
    let palaceBullet = null;
    if (domain === 'money') {
      const top = dominant[0];
      palaceBullet = bullet(DOMINANT_MONEY[top],
        [`dominant:${ELEMENT_PLAIN[top].name}`, `domain:${domain}`],
        `domain:${domain}:dominant:${top}`);
    } else {
      const pillar = chart.pillars[PALACE_PILLAR[domain]];
      // 時支 is absent from a timeless record, so 心と体 simply loses this line
      // rather than being given an invented one.
      if (pillar) {
        const r = relationTo(me, pillar.branchElement);
        palaceBullet = bullet(PALACE[domain][r],
          [`${PALACE_PILLAR[domain]}_branch:${pillar.branchChar}`, `relation:${r}`, `domain:${domain}`],
          `domain:${domain}:palace:${r}`);
      }
    }

    const candidates = [
      needBullet,
      palaceBullet,
      ...missing.map((e) => bullet(MISSING[e][domain],
        [`absent:${ELEMENT_PLAIN[e].name}`, `domain:${domain}`], `domain:${domain}:absent:${e}`)),
      luckFit ? bullet(LUCK_NOW[luckFit][domain],
        [`luck_now:${luckFit}`, `domain:${domain}`], `domain:${domain}:luck:${luckFit}`) : null,
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
export function domainStatements(chart, strength, options = {}) {
  const perDomain = Object.values(domainBullets(chart, strength, options)).flatMap((d) => d.bullets);
  const cards = summaryCards(chart, strength).flatMap((c) => c.bullets);
  const note = needAbsentNote(chart, strength);
  return perDomain.concat(cards, note ? [note] : []);
}

/**
 * 語り — the reading in the traditional voice.
 *
 * This file does what app/engine/reading.js deliberately refuses to do: it
 * speaks about the person, gives advice, and reads the year ahead. That is why
 * it lives behind its own page and never touches the chart page.
 *
 * The division is the honest part. On the board page, every sentence is
 * checkable against the eight characters and anything unsourced is destroyed at
 * generation. Here the register changes, and the page says so plainly rather
 * than letting the reader assume the two carry the same weight.
 *
 * What keeps this from being a Barnum machine anyway:
 *
 *   - every passage is still keyed to specific characters, and still carries
 *     its sources, so nothing here fits everybody;
 *   - the imagery for the ten stems (甲 the standing tree, 辛 the polished
 *     stone, 壬 the open sea …) is the received 十干の象 of the tradition, not
 *     invented here;
 *   - the same anti-Barnum measurement runs over this layer too.
 *
 * 正確さは盤に、断言は読みに。The board does not bend; this page is where the
 * tradition is allowed to speak in its own voice.
 */

import { ELEMENTS, ELEMENT_NAMES, STEMS, BRANCHES, elementBalance, pillarFromIndex } from './pillars.js';
import { governingRisshun } from './terms.js';
import { calendarDate } from './swe.js';

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
const el = (e) => ELEMENT_NAMES[e];

/**
 * 十干の象 — the received imagery of the ten stems, with the character reading
 * that has traditionally been drawn from each.
 */
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

/** How the season stands to the day master, in the traditional register. */
function seasonStance(me, season) {
  if (me === season) {
    return { key: `${el(me)}比和`, tenor: 'strong', text: `生まれた季節の五行は${el(season)}。日主と同じものが季節を占めている。地の利がある側で、押せば通る。通りすぎることのほうが、この人には難しい。` };
  }
  if (GENERATES[season] === me) {
    return { key: `${el(season)}生${el(me)}`, tenor: 'strong', text: `季節の五行は${el(season)}で、これは${el(me)}を生じる。与えられて生まれてきた側だ。手が足りなくなることは少なく、そのぶん自分で掴む理由を見つけにくい。` };
  }
  if (GENERATES[me] === season) {
    return { key: `${el(me)}生${el(season)}`, tenor: 'weak', text: `季節の五行は${el(season)}で、${el(me)}はこれを生じる。生まれつき与える側に立っている。出し続ける配置なので、補給を自分の仕事だと思っていないと、静かに減っていく。` };
  }
  if (CONTROLS[me] === season) {
    return { key: `${el(me)}剋${el(season)}`, tenor: 'active', text: `季節の五行は${el(season)}で、${el(me)}はこれを剋す。生まれた季節に働きかける側だ。扱う対象があるほど落ち着き、何もない時期に持て余す。` };
  }
  return { key: `${el(season)}剋${el(me)}`, tenor: 'pressed', text: `季節の五行は${el(season)}で、これが${el(me)}を剋す。生まれた季節に抑えられている側だ。楽な配置ではない。ただし抑えられて形になるものは、抑えられなかったものより硬い。` };
}

/** The tendencies the balance of the eight characters points at. */
function tendencies(chart) {
  const { counts, sources, total } = elementBalance(chart.pillars);
  const out = [];
  const peak = Math.max(...ELEMENTS.map((e) => counts[e]));

  const heavy = ELEMENTS.filter((e) => counts[e] === peak && peak >= 3);
  for (const e of heavy) {
    const line = {
      wood: '伸びること、始めること、育てることに手が伸びる。伸ばす先が無い時期がいちばん苦しい。',
      fire: '明るみに出すこと、伝えること、燃やすことに手が伸びる。灯し続けるための薪を、自分で用意する必要がある。',
      earth: '受け止めること、貯めること、均すことに手が伸びる。動かないことが安定にも停滞にもなる。',
      metal: '断つこと、削ること、決めることに手が伸びる。切れ味は、鈍らせないと人を傷つける。',
      water: '流れること、知ること、巡らせることに手が伸びる。留まれない性質は、自由にも根無しにもなる。',
    }[e];
    out.push({
      text: `八字のうち${peak}字が${el(e)}。${line}`,
      source: [...sources[e], `element:${el(e)}`],
      key: `voiceDominant:${el(e)}`,
    });
  }

  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  for (const e of missing) {
    const line = {
      wood: '始める力を、外から借りるか、後から身につけることになる。',
      fire: '自分を明るみに出す働きを、意識して作らないと省いてしまう。',
      earth: '受け止めて留める働きが薄い。抱えたものが素通りしやすい。',
      metal: '断つ働きが薄い。決めきれずに持ち越したものが積もりやすい。',
      water: '巡らせて流す働きが薄い。溜め込んだものを自分で動かしにくい。',
    }[e];
    out.push({
      text: `${total}字を数えて、${el(e)}が一字も無い。${line}無いものは、生涯かけて外から取りに行くことになる。`,
      source: [`absent:${el(e)}`, `counted_total:${total}`],
      key: `voiceAbsent:${el(e)}`,
    });
  }
  return out;
}

/** Themes the stem unions and branch clashes put on the board. */
function relations(chart) {
  const out = [];
  const P = { year: '年', month: '月', day: '日', hour: '時' };
  const order = ['year', 'month', 'day', 'hour'];
  const era = { year: '生家と育った土台', month: '仕事と社会に出た場所', day: '自分と伴侶', hour: '晩年と、自分が作る側の場' };

  for (let i = 0; i < order.length - 1; i += 1) {
    const a = chart.pillars[order[i]];
    const b = chart.pillars[order[i + 1]];
    if (!a || !b || Math.abs(a.stem - b.stem) !== 5) continue;
    out.push({
      text: `${P[order[i]]}干${a.stemChar}と${P[order[i + 1]]}干${b.stemChar}が干合している。隣り合う二つが結ばれる配置で、${era[order[i]]}と${era[order[i + 1]]}が、切り離せない一つの話として動く。`,
      source: [`${order[i]}_stem:${a.stemChar}`, `${order[i + 1]}_stem:${b.stemChar}`, `relation:${a.stemChar}${b.stemChar}合`],
      key: `voiceUnion:${order[i]}`,
    });
  }

  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const a = chart.pillars[order[i]];
      const b = chart.pillars[order[j]];
      if (!a || !b || Math.abs(a.branch - b.branch) !== 6) continue;
      out.push({
        text: `${P[order[i]]}支${a.branchChar}と${P[order[j]]}支${b.branchChar}が冲。向かい合って動かし合う配置で、${era[order[i]]}と${era[order[j]]}のあいだに、揺れが置かれている。揺れは壊れではない。動かないものは、動かせもしない。`,
        source: [`${order[i]}_branch:${a.branchChar}`, `${order[j]}_branch:${b.branchChar}`, `relation:${a.branchChar}${b.branchChar}冲`],
        key: `voiceClash:${order[i]}${order[j]}`,
      });
    }
  }
  return out;
}

/**
 * 年運 — how the current solar year stands to the day master.
 * The year turns at 立春, not on 1 January, so it is computed the same way the
 * year pillar is.
 */
export function yearAhead(chart, nowJdUt) {
  const risshun = governingRisshun(nowJdUt, 'teiki');
  const solarYear = calendarDate(risshun).year;
  const pillar = pillarFromIndex(((solarYear - 4) % 60 + 60) % 60);
  const me = chart.pillars.day.stemElement;
  const it = pillar.stemElement;

  let text;
  let key;
  if (me === it) {
    key = 'peer';
    text = `今年は${pillar.text}。年の干は${el(it)}で、日主と同じ五行が巡っている。同じものが増える年で、味方も競合も同時に増える。分け合うことを決めておくと荒れない。`;
  } else if (GENERATES[it] === me) {
    key = 'support';
    text = `今年は${pillar.text}。年の干は${el(it)}で、${el(me)}を生じる。与えられる年だ。受け取る用意がある者にだけ届くので、求めることを恥じないほうがいい。`;
  } else if (GENERATES[me] === it) {
    key = 'output';
    text = `今年は${pillar.text}。年の干は${el(it)}で、${el(me)}がこれを生じる。出す年だ。作ったものが外へ出ていく代わりに、自分は減る。休む予定を先に入れておくこと。`;
  } else if (CONTROLS[me] === it) {
    key = 'gain';
    text = `今年は${pillar.text}。年の干は${el(it)}で、${el(me)}がこれを剋す。掴みにいく年だ。対象がはっきりしているほど働きやすく、漠然と待つといちばん損をする。`;
  } else {
    key = 'pressure';
    text = `今年は${pillar.text}。年の干は${el(it)}で、${el(me)}を剋す。圧のかかる年だ。抑えられている間は形が決まる時期でもある。逃げ切るより、削られる場所を選ぶほうがいい。`;
  }

  return {
    text,
    source: [`day_stem:${chart.pillars.day.stemChar}`, `year_of_reading:${pillar.text}`, `relation:${el(it)}／${el(me)}`],
    key: `voiceYear:${key}`,
    pillar,
    solarYear,
  };
}

/** Advice, drawn from the stance and the balance — never from nowhere. */
function advice(chart, stance) {
  const { counts } = elementBalance(chart.pillars);
  const out = [];
  const day = chart.pillars.day;

  const byStance = {
    strong: '力のある配置なので、足すより使うほうへ回したほうがいい。抱えたまま強くなっても、行き場が無い。',
    weak: '出す側の配置なので、補給を予定に組み込むこと。休むことは怠けではなく、この盤では作業のうちだ。',
    active: '扱う対象があるほど整う配置だ。仕事でも人でもいい、手をかける相手を切らさないこと。',
    pressed: '抑えられる配置だ。逆らって消耗するより、圧のかかる場所を自分で選ぶほうが早く形になる。',
  };
  out.push({
    text: byStance[stance.tenor],
    source: [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`, `relation:${stance.key}`],
    key: `voiceAdvice:${stance.tenor}`,
  });

  const missing = ELEMENTS.filter((e) => counts[e] === 0);
  if (missing.length > 0) {
    const how = {
      wood: '新しく始める場に身を置く',
      fire: '人前に出す機会を作る',
      earth: '留める仕組みを外から借りる',
      metal: '締切と基準を人に決めてもらう',
      water: '流れる場所へ定期的に移る',
    };
    out.push({
      text: `${missing.map(el).join('と')}が無い盤なので、${missing.map((e) => how[e]).join('、')}——それを習慣のほうで補うことになる。持っていないものは、性格で補えない。`,
      source: missing.map((e) => `absent:${el(e)}`),
      key: `voiceAdviceAbsent:${missing.map(el).join('')}`,
    });
  }
  return out;
}

/** The whole reading, in the traditional voice. */
export function speak(chart, nowJdUt) {
  const day = chart.pillars.day;
  const image = STEM_IMAGE[day.stemChar];
  const stance = seasonStance(day.stemElement, chart.pillars.month.branchElement);

  return {
    portrait: {
      title: `${day.stemChar} — ${image.image}`,
      text: image.body,
      source: [`day_stem:${day.stemChar}`, `image:${image.image}`],
      key: `voicePortrait:${day.stemChar}`,
    },
    season: {
      text: stance.text,
      source: [`day_stem:${day.stemChar}`, `month_branch:${chart.pillars.month.branchChar}`, `relation:${stance.key}`],
      key: `voiceSeason:${stance.key}`,
    },
    tendencies: tendencies(chart),
    relations: relations(chart),
    year: yearAhead(chart, nowJdUt),
    advice: advice(chart, stance),
  };
}

/** Every passage, flattened — for the anti-Barnum measurement. */
export function voiceStatements(chart, nowJdUt) {
  const v = speak(chart, nowJdUt);
  return [v.portrait, v.season, ...v.tendencies, ...v.relations, v.year, ...v.advice]
    .filter((s) => s && s.text && Array.isArray(s.source) && s.source.length > 0);
}

export { STEMS, BRANCHES };

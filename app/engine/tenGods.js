/**
 * 通変星（十神）— the vocabulary a 四柱推命 reading is actually spoken in.
 *
 * Everything above this file reads at the resolution of 五行: "you need 土",
 * "the month branch drains you". True, and coarse. The tradition does not stop
 * there — it names the *relationship* between the day master and each other
 * character, and those names are what a reading is built out of. 財 is money and
 * what you can handle; 官 is position and what holds you to account; 印 is
 * support and learning; 食傷 is what you put out; 比劫 is people standing on
 * your level.
 *
 * That mapping onto the reader's own life is why this is worth having. It is
 * **not** worth having for discrimination, and it is worth being clear about
 * that, because the guess going in was the opposite. Measured over 20,000
 * charts, the per-scene bullets already reach 92.7% of the distinct 命式 in the
 * sample after the branch and 大運 materials were wired in; adding 通変星 on top
 * moves that by well under a point. It buys language, not separation.
 *
 * Derivation — 五行の関係 × 陰陽の同異, and nothing else:
 *
 *              同じ陰陽      違う陰陽
 *   比和        比肩          劫財
 *   我生        食神          傷官
 *   我剋        偏財          正財
 *   剋我        偏官          正官
 *   生我        偏印          印綬
 *
 * There is no table to get wrong here and no school to pick: the ten names fall
 * out of two facts the engine already holds. tools/verify.mjs checks all one
 * hundred stem pairs against four structural laws rather than against a copied
 * table, the same way the 蔵干 table is checked by 三合 structure.
 */

import { STEMS, STEM_ELEMENT } from './pillars.js';
import { hiddenStems } from './hidden.js';

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const CONTROLS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

/** 陽 is an even position in the cycle of ten. */
const isYang = (index) => index % 2 === 0;

/**
 * The 通変星 of one stem as seen from the day master.
 *
 * Both arguments are stem indices 0-9 (甲 = 0).
 */
export function tenGod(dayIndex, otherIndex) {
  const me = STEM_ELEMENT[dayIndex];
  const it = STEM_ELEMENT[otherIndex];
  const same = isYang(dayIndex) === isYang(otherIndex);

  if (me === it) return same ? '比肩' : '劫財';
  if (GENERATES[me] === it) return same ? '食神' : '傷官';
  if (CONTROLS[me] === it) return same ? '偏財' : '正財';
  if (CONTROLS[it] === me) return same ? '偏官' : '正官';
  return same ? '偏印' : '印綬';
}

/** Same, by character rather than by index. */
export function tenGodOf(dayChar, otherChar) {
  return tenGod(STEMS.indexOf(dayChar), STEMS.indexOf(otherChar));
}

/**
 * The five groups a reading actually talks in.
 *
 * A 正/偏 pair shares a subject and differs in how it arrives — 正財 is money
 * that comes on schedule, 偏財 is money that moves. Grouping them is what lets a
 * scene section ask one question ("does this chart hold 官 at all?") instead of
 * ten.
 */
export const GOD_GROUP = {
  比肩: 'peer', 劫財: 'peer',
  食神: 'output', 傷官: 'output',
  偏財: 'wealth', 正財: 'wealth',
  偏官: 'office', 正官: 'office',
  偏印: 'resource', 印綬: 'resource',
};

export const GROUP_PLAIN = {
  peer: { name: '比劫', subject: '対等な相手' },
  output: { name: '食傷', subject: '外に出すもの' },
  wealth: { name: '財', subject: 'お金と、扱えるもの' },
  office: { name: '官', subject: '立場と、自分を律するもの' },
  resource: { name: '印', subject: '支えと、学ぶこと' },
};

/**
 * The ten, in plain modern Japanese.
 *
 * Same rule as plainwords.js: say it the way you would say it to a friend, and
 * let the technical name follow rather than lead. `image` is the handle a reader
 * keeps; `body` is what it means for them.
 */
export const TEN_GOD_PLAIN = {
  比肩: {
    image: '対等な相手',
    body: '自分と同じ強さの人が近くにいる形です。群れるより、横に並ぶ関係が向きます。'
      + '人に合わせるのが苦手なぶん、自分のやり方を通せます。',
  },
  劫財: {
    image: '取り合う相手',
    body: '同じものを狙う人が近くにいる形です。押しが強く出ますが、'
      + '仲間にも競争相手にもなる相手なので、組み方しだいで結果が変わります。',
  },
  食神: {
    image: '気持ちよく出す力',
    body: '楽しんで出すほうの力です。作る、話す、食べる、遊ぶ——'
      + '無理をしないで出しているときがいちばん伸びます。',
  },
  傷官: {
    image: '鋭く出す力',
    body: '尖ったものが出る力です。人が気づかないところに気づきますが、'
      + '言い方がきつくなりやすいので、そこだけ気をつけると武器になります。',
  },
  偏財: {
    image: '動かすお金',
    body: '回して増やすほうのお金と、人の縁です。じっとしているより、'
      + '動かしているときに入ってきます。',
  },
  正財: {
    image: '堅いお金',
    body: 'こつこつ積むほうのお金です。決めた通りに使い、決めた通りに貯める。'
      + '派手さは無いですが、いちばん減りません。',
  },
  偏官: {
    image: '強い圧力',
    body: '重い責任が、断りにくい形で来ます。しんどい代わりに突破力になるので、'
      + '受ける量さえ間違えなければ強い味方です。',
  },
  正官: {
    image: '決まりと立場',
    body: '役割や肩書きが、きちんと形になる力です。守るべきものを守る人だと'
      + '見られます。窮屈に感じる日もあります。',
  },
  偏印: {
    image: '変わった学び',
    body: '人と違う筋から支えが来ます。独学、勘、正規のルートではない後ろ盾。'
      + '当たると速いですが、続かないこともあります。',
  },
  印綬: {
    image: 'まっとうな学び',
    body: '教わる、守られる、資格を取る——正面から支えが来る形です。'
      + '甘えすぎると自分で動かなくなる面もあります。',
  },
};

/**
 * Every 通変星 on the board, with where it sits.
 *
 * The day stem is the day master itself and has no 通変星 — it is the thing the
 * others are measured against. Branches are read through their 本気, the hidden
 * stem that rules them, which is the ordinary convention and keeps this to one
 * label per position rather than three.
 */
export function chartTenGods(pillars) {
  const day = pillars.day;
  const out = [];

  for (const [key, label] of [['year', '年'], ['month', '月'], ['day', '日'], ['hour', '時']]) {
    const p = pillars[key];
    if (!p) continue;
    if (key !== 'day') {
      out.push({
        position: `${label}干`,
        pillar: key,
        char: p.stemChar,
        god: tenGod(day.stem, p.stem),
        source: `${key}_stem:${p.stemChar}`,
      });
    }
    const honki = hiddenStems(p.branchChar).find((h) => h.role === '本気');
    out.push({
      position: `${label}支`,
      pillar: key,
      char: p.branchChar,
      via: honki.stemChar,
      god: tenGodOf(day.stemChar, honki.stemChar),
      source: `${key}_branch:${p.branchChar}`,
    });
  }
  return out;
}

/** How many of each group the board holds, and where. */
export function godGroups(pillars) {
  const all = chartTenGods(pillars);
  const groups = {};
  for (const key of Object.keys(GROUP_PLAIN)) groups[key] = [];
  for (const entry of all) groups[GOD_GROUP[entry.god]].push(entry);
  return groups;
}

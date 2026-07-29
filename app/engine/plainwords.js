/**
 * Plain modern Japanese for everything the reader sees.
 *
 * The first drafts of the reading were written in a literary, faintly Meiji
 * register — 「無理が利かないのではなく、無理の利かせ方が違う」 — and put raw
 * jargon (日主, 用神, 月令, 相剋) straight on screen. It read as decoration and
 * communicated nothing. Somebody who has never opened a 四柱推命 book could not
 * tell what they were being told.
 *
 * The rule for this file: **say it the way you would say it to a friend.**
 *
 *   - second person, です・ます, short sentences;
 *   - the technical term never leads. It may follow, small, in brackets, so a
 *     reader who wants to look it up still can;
 *   - every abstraction lands on something concrete — not 「所属」 but
 *     「会社でも家でも、続けている習慣でもいい」;
 *   - no 体言止め, no 文語, no aphorisms.
 *
 * The arithmetic and the citations stay technical: those are for checking, and
 * they live in the small print where they belong.
 */

/** 五行, as a thing you do on a Tuesday rather than a cosmological principle. */
export const ELEMENT_PLAIN = {
  wood: {
    name: '木',
    doing: '新しく始める・学ぶ・育てる',
    concrete: '新しい環境に入る、勉強を始める、後輩や作品を育てる',
    lacking: '始めるきっかけを、自分ではなかなか作れません',
  },
  fire: {
    name: '火',
    doing: '人前に出る・発信する・人と会う',
    concrete: '人前で話す、SNSや作品で外に出す、人と会う予定を入れる',
    lacking: '自分から名乗り出るのが苦手で、いるのに気づかれないことがあります',
  },
  earth: {
    name: '土',
    doing: '決まった居場所を持つ・貯める・続ける',
    concrete: '会社や家など動かない所属、貯金、毎日続けている習慣',
    lacking: '受け止めて溜めておく力が弱く、入ってきたものが素通りしがちです',
  },
  metal: {
    name: '金',
    doing: '決める・締切を作る・専門を磨く',
    concrete: '締切と基準を決める、要らないものを切る、ひとつの技術を深める',
    lacking: '決めきれずに持ち越したものが、だんだん溜まっていきます',
  },
  water: {
    name: '水',
    doing: '動く・調べる・人と話す',
    concrete: '移動する、情報を集める、人と話して流れを作る',
    lacking: '溜め込んだものを自分で動かすのが苦手です',
  },
};

/** The verdict, named for what it means rather than for what it is called. */
export const VERDICT_PLAIN = {
  weak: {
    headline: 'エネルギー控えめ型',
    term: '身弱',
    oneLine: 'ひとりで抱えるより、支えを先に作ると回るタイプ',
  },
  strong: {
    headline: 'エネルギー多め型',
    term: '身強',
    oneLine: '溜めるより、出して使うほうが調子が出るタイプ',
  },
  neutral: {
    headline: 'バランス型',
    term: '中庸',
    oneLine: '環境しだいでどちらにも振れる、可変のタイプ',
  },
};

/** The ten day stems, as an image plus one plain sentence. */
export const STEM_PLAIN = {
  甲: { image: '大樹', tag: 'まっすぐ伸びるタイプ', body: '大きな木のような人です。曲がるのが苦手で、上へ伸びることで自分を確かめます。まわりに合わせて形を変えるのは得意ではありません。折れるとしたら、しなれなかったときです。' },
  乙: { image: '蔓草', tag: 'しなやかに回り込むタイプ', body: 'つる草のような人です。正面からぶつからず、隙間を見つけて伸びます。強そうに見せないぶん、折れません。まっすぐでないのは弱さではなく、あなたの戦い方です。' },
  丙: { image: '太陽', tag: '隠せない明るさのタイプ', body: '太陽のような人です。相手を選ばず照らすし、自分の消耗をあまり数えません。まわりは明るくなりますが、本人はいつも少し焼けています。' },
  丁: { image: '灯火', tag: '近くを温めるタイプ', body: 'ろうそくの火のような人です。全体ではなく、目の前のひとりを温めます。風には弱い。守られている場所でだけ、驚くほど遠くまで届きます。' },
  戊: { image: '山', tag: 'どっしり受け止めるタイプ', body: '山のような人です。押されても動かず、簡単には形を変えません。頼られるのには慣れていますが、頼るのは苦手です。' },
  己: { image: '畑の土', tag: '育てる側に回るタイプ', body: '耕された土のような人です。自分が実るより、誰かが実るために場所を差し出します。踏まれることと育てることが、あなたの中では同じ働きです。' },
  庚: { image: '刀', tag: 'はっきり決めるタイプ', body: '刀のような人です。切ることをためらわず、曖昧なままが嫌いです。その鋭さは生まれつきではなく、叩かれた回数のぶんだけあります。' },
  辛: { image: '宝石', tag: '磨くほど光るタイプ', body: '宝石のような人です。原石のままでは値がつかず、削られてはじめて自分になります。細かいところに厳しいのは、自分がそう扱われてきたからです。' },
  壬: { image: '大海', tag: '止まらないタイプ', body: '海のような人です。深さは見せず、入れ物に合わせて形を変え、どこへでも流れていきます。「ここに留まれ」と言われるのが、いちばんこたえます。' },
  癸: { image: '雨', tag: 'じわじわ効くタイプ', body: '雨のような人です。音を立てず、低いところへ行き、気づかれないうちに行き渡っています。派手に働かないので、働いていないと誤解されることがあります。' },
};

/** 40 type names: season × stem image. */
export const SEASON_PLAIN = { 春: '春', 夏: '夏', 秋: '秋', 冬: '冬' };

/** Natural frequency, said the way a person would say it. */
export function peopleIn(frequency) {
  if (frequency === null || frequency <= 0) return null;
  if (frequency >= 0.995) return 'ほぼ全員に当てはまります';
  const oneIn = Math.round(1 / frequency);
  if (oneIn <= 1) return 'ほぼ全員に当てはまります';
  return `${oneIn}人に1人`;
}

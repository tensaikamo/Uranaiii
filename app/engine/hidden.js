/**
 * 蔵干 — the stems hidden inside each branch.
 *
 * A branch is not a single element. 寅 is nominally 木, but it carries 甲 (its
 * 本気), 丙 (中気) and 戊 (余気), and a reading that counts only the nominal
 * element is counting a fraction of what is there. This is what the strength
 * verdict meant by "蔵干 is not counted, so near the boundary this can flip".
 *
 * The table varies between schools in its details, but it is not arbitrary. It
 * has two structural rules, and writing them down is the only reason a
 * hand-entered table like this is safe:
 *
 *   余気  the tail of the branch before it. 丑 follows 子 and keeps 癸; 卯
 *         follows 寅 and keeps 甲; 午 follows 巳 and keeps 丙. Every branch,
 *         no exceptions — the cycle wraps from 亥 back to 子.
 *
 *   中気  the 三合局 partner. 寅午戌 pool on fire, so 寅 hides 丙 and 戌 hides
 *         丁; 申子辰 pool on water; 亥卯未 on wood; 巳酉丑 on metal. The four
 *         四正 branches 子卯酉 have no 中気 at all (午 is the exception: it
 *         carries 己).
 *
 * tools/verify.mjs re-derives both rules — the 余気 from the branch order, the
 * 中気 from the triads — and fails if this table drifts from them. A typo here
 * would otherwise be silent and would quietly bend every strength verdict.
 *
 * Weights: each branch is worth 1 in total however many stems it hides, so
 * turning 蔵干 on does not rescale the strength score. That keeps the two runs
 * comparable, which is the point of computing both.
 */

import { STEMS, BRANCHES, STEM_ELEMENT } from './pillars.js';

/**
 * 本気 / 中気 / 余気 for each branch. `null` where a branch has no 中気.
 */
const TABLE = {
  子: { 本気: '癸', 中気: null, 余気: '壬' },
  丑: { 本気: '己', 中気: '辛', 余気: '癸' },
  寅: { 本気: '甲', 中気: '丙', 余気: '戊' },
  卯: { 本気: '乙', 中気: null, 余気: '甲' },
  辰: { 本気: '戊', 中気: '癸', 余気: '乙' },
  巳: { 本気: '丙', 中気: '庚', 余気: '戊' },
  午: { 本気: '丁', 中気: '己', 余気: '丙' },
  未: { 本気: '己', 中気: '乙', 余気: '丁' },
  申: { 本気: '庚', 中気: '壬', 余気: '戊' },
  酉: { 本気: '辛', 中気: null, 余気: '庚' },
  戌: { 本気: '戊', 中気: '丁', 余気: '辛' },
  亥: { 本気: '壬', 中気: '甲', 余気: '戊' },
};

/** Shares by how many stems a branch hides. Each row sums to 1. */
const SHARES = {
  2: { 本気: 0.7, 余気: 0.3 },
  3: { 本気: 0.6, 中気: 0.25, 余気: 0.15 },
};

/**
 * The hidden stems of a branch, strongest first, with the share of the branch
 * each one carries. `branch` may be the character or the index.
 */
export function hiddenStems(branch) {
  const ch = typeof branch === 'number' ? BRANCHES[branch] : branch;
  const row = TABLE[ch];
  if (!row) return [];
  const roles = row.中気 ? ['本気', '中気', '余気'] : ['本気', '余気'];
  const shares = SHARES[roles.length];
  return roles.map((role) => {
    const stemChar = row[role];
    const stem = STEMS.indexOf(stemChar);
    return { stemChar, stem, element: STEM_ELEMENT[stem], role, share: shares[role] };
  });
}

/** The whole table, for the structural checks and for display. */
export function hiddenTable() {
  return BRANCHES.map((ch) => ({ branch: ch, stems: hiddenStems(ch) }));
}

/** 三合局 — the four triads, each pooling on one element. */
export const TRIADS = [
  { branches: ['寅', '午', '戌'], element: 'fire' },
  { branches: ['申', '子', '辰'], element: 'water' },
  { branches: ['亥', '卯', '未'], element: 'wood' },
  { branches: ['巳', '酉', '丑'], element: 'metal' },
];

/** Branches with no 中気 — the pure ones. 午 is not among them. */
export const NO_MIDDLE = ['子', '卯', '酉'];

/**
 * The sampler every measurement in this repository draws from.
 *
 * ## Why this file exists
 *
 * It used to be one line, copied into nine places:
 *
 *     seed = (seed * 1103515245 + 12345) & 0x7fffffff;
 *
 * That is a textbook LCG, and in C it is fine. In JavaScript it is not: `seed`
 * reaches 2^31, and 2^31 × 1103515245 is about 2.4 × 10^18, well past the
 * 2^53 where a double stops being able to represent consecutive integers. The
 * low bits of the product — the only bits the `& 0x7fffffff` keeps — are
 * rounding noise. The generator was not weak, it was **broken**.
 *
 * Measured, on the exact call pattern `build-rarity.mjs` used:
 *
 *   - months 3, 4, 7, 8, 11 and 12 **never occurred at all**
 *   - 20,000 draws produced **161 distinct (month, day, hour) triples**
 *
 * So the frequency table that the whole anti-Barnum argument rests on — the
 * "◯人に1人" beside each line, the thing offered to the reader as a check
 * against feeling spoken to — was measured over a sample that contained no
 * spring and no autumn. Every number it produced was answering a different
 * question from the one it claimed to answer.
 *
 * ## What replaced it
 *
 * mulberry32: a small, well-tested, seedable generator that stays inside 32
 * bits by construction, because every multiply goes through `Math.imul`. It is
 * deterministic and seeded explicitly, which is what these measurements need —
 * a rarity table nobody can reproduce is not evidence.
 *
 * The self-test in `tools/verify.mjs` checks the properties that failed here:
 * that every bucket of a small range is actually reached, and that draws do not
 * collapse onto a handful of repeated tuples.
 */

/** A seeded uniform [0,1) generator. Same seed, same sequence, always. */
export function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An integer sampler over inclusive ranges.
 *
 * Returns `rnd(lo, hi)`. Multiplying the float rather than taking a remainder
 * also removes the modulo bias the old line had on top of everything else —
 * `seed % 12` favours the low values whenever 12 does not divide the range.
 */
export function sampler(seed) {
  const next = mulberry32(seed);
  return (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
}

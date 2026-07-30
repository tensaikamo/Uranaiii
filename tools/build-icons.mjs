/**
 * Generate the home-screen icons.
 *
 * The app ships no image assets — the starfield is procedural and the 天盤 is
 * SVG — but a home-screen icon has to be a raster file, and iOS will not take
 * an SVG for `apple-touch-icon`. So the artwork is written here as SVG, drawn
 * from the same 羅盤 vocabulary as `app/ui/dial.js` (concentric brass rules on a
 * night ground, twelve ticks), and rasterised once. The PNGs are committed, the
 * way `strokes.js` and `rarity.js` are: generated, checked in, no build step in
 * front of the reader.
 *
 * Run:  node tools/build-icons.mjs
 * Writes app/icons/*.png. Re-run only when the artwork changes.
 *
 * The maskable variant is a separate drawing rather than the same one padded:
 * Android crops maskable icons to an arbitrary shape, keeping only the central
 * 80% circle, so everything that must survive is drawn inside that radius.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'app/icons');

const BRASS = '#C9A961';
const BRASS_DIM = 'rgba(201,169,97,0.42)';
const GROUND = '#070C14';

/**
 * The artwork, at a 512 viewBox.
 *
 * `inset` shrinks the drawing toward the centre for the maskable variant;
 * `bleed` fills the whole square with ground so the crop never shows white.
 */
function artwork({ inset = 1, radius = 236 } = {}) {
  const c = 256;
  const r = radius * inset;
  const ticks = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const outer = r * 0.97;
    const inner = r * (i % 3 === 0 ? 0.82 : 0.88);
    ticks.push(
      `<line x1="${(c + Math.cos(a) * inner).toFixed(2)}" y1="${(c + Math.sin(a) * inner).toFixed(2)}"`
      + ` x2="${(c + Math.cos(a) * outer).toFixed(2)}" y2="${(c + Math.sin(a) * outer).toFixed(2)}"`
      + ` stroke="${BRASS}" stroke-width="${i % 3 === 0 ? 7 : 3.5}" stroke-linecap="round"`
      + ` opacity="${i % 3 === 0 ? 0.95 : 0.55}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="aurora" cx="34%" cy="26%" r="78%">
      <stop offset="0%" stop-color="#16344A"/>
      <stop offset="52%" stop-color="#0C1420"/>
      <stop offset="100%" stop-color="${GROUND}"/>
    </radialGradient>
    <radialGradient id="well" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#132032" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${GROUND}" stop-opacity="0.2"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F6EBD2"/>
      <stop offset="60%" stop-color="${BRASS}"/>
      <stop offset="100%" stop-color="#8A6E33"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" fill="url(#aurora)"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.9).toFixed(2)}" fill="url(#well)"/>

  <circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${BRASS}" stroke-width="4" opacity="0.9"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.94).toFixed(2)}" fill="none" stroke="${BRASS_DIM}" stroke-width="2"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.7).toFixed(2)}" fill="none" stroke="${BRASS_DIM}" stroke-width="2"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.52).toFixed(2)}" fill="none" stroke="${BRASS}" stroke-width="2.5" opacity="0.75"/>
  ${ticks.join('\n  ')}

  <text x="${c}" y="${c}" fill="url(#gold)" font-family="IPAMincho, 'IPA明朝', serif"
        font-size="${(r * 0.82).toFixed(0)}" text-anchor="middle" dominant-baseline="central">命</text>
</svg>`;
}

const VARIANTS = [
  { file: 'icon-192.png', size: 192, svg: artwork() },
  { file: 'icon-512.png', size: 512, svg: artwork() },
  // iOS applies its own rounded-rect mask and does not honour transparency.
  { file: 'apple-touch-icon.png', size: 180, svg: artwork() },
  // Android may crop to a circle; keep everything inside the central 80%.
  { file: 'icon-maskable-512.png', size: 512, svg: artwork({ inset: 0.78 }) },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const { file, size, svg } of VARIANTS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:${GROUND}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  const buffer = await page.screenshot({ omitBackground: false });
  writeFileSync(join(OUT, file), buffer);
  await page.close();
  console.log(`wrote app/icons/${file}  ${size}x${size}  ${(buffer.length / 1024).toFixed(1)} KB`);
}
await browser.close();

// The SVG is kept too: it is the source, and a browser that prefers vector can
// use it for the tab icon.
writeFileSync(join(OUT, 'icon.svg'), `${artwork()}\n`);
console.log('wrote app/icons/icon.svg');

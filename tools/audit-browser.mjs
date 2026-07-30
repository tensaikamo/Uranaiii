/**
 * Browser audit — the invariants that cannot be checked from Node.
 *
 * `verify.mjs` checks the arithmetic. This checks the things that are only true
 * once a real engine has parsed the CSS, run the modules, laid the page out and
 * talked to a network: that nothing is sent, that nothing is stored, that the
 * page does not scroll sideways on a phone, that it works with the network off,
 * and that the figures encode what they claim to encode.
 *
 * These checks existed and passed for several rounds — as a scratch file outside
 * the repository, which meant the README's claim that "the browser audit watches
 * this" was true for exactly one machine and false for everybody else. A check
 * nobody else can run is not a check. So it lives here now.
 *
 * Run:  node tools/audit-browser.mjs [baseUrl]
 * It starts its own server unless a URL is given. Exits non-zero on failure.
 *
 * Playwright and Chromium ship with this dev environment. Where they are absent
 * this **skips with a stated reason rather than failing**: the gate is
 * verify.mjs, and a missing browser is not a defect in the app.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* --- a static server, so the audit has no dependency on one being up ------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.data': 'application/octet-stream',
};

/**
 * Serve the repo under `/Uranaiii/`.
 *
 * Deliberately not at the server root: GitHub Pages publishes this from a
 * subpath, and a manifest scope or a service-worker registration that only works
 * at "/" would pass an audit run at the root and break in production. Testing
 * the shape it actually ships in is the point.
 */
const PREFIX = '/Uranaiii';

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
      let rel = url.pathname.slice(PREFIX.length) || '/';
      if (rel.endsWith('/')) rel += 'index.html';
      const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      const body = await readFile(path);
      res.writeHead(200, {
        'content-type': MIME[extname(path)] || 'application/octet-stream',
        // The worker must be allowed to control the whole subpath.
        'service-worker-allowed': `${PREFIX}/`,
      });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* --- results ---------------------------------------------------------------- */

const results = [];
let failures = 0;
function record(section, name, passed, detail = '') {
  results.push({ section, name, passed, detail });
  if (!passed) failures += 1;
}

/**
 * Fill the form and cast a chart.
 * `time` and `sex` are optional on purpose — a timeless record is three pillars
 * and no sex means no 大運, and both are supported inputs that the audit has to
 * exercise rather than assume away.
 */
async function cast(page, { time = '06:30', sex = true, voice = false } = {}) {
  await page.waitForSelector('#form:not([hidden])', { timeout: 60000 });
  await page.fill('#birthdate', '1990-06-15');
  await page.fill('#birthtime', time || '');
  if (voice && sex) await page.click('#sex button:nth-child(1)');
  await page.fill('#longitude', '141.77');
  await page.click('button[type=submit]');
  await page.waitForSelector('#output:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(900);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try {
      ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
    } catch {
      console.log('SKIP  playwright が見つからないのでブラウザ監査は実行しません。');
      console.log('      検算の門は tools/verify.mjs です。ブラウザ側を回すには:');
      console.log('        npm i -D playwright && npx playwright install chromium');
      process.exit(0);
    }
  }

  const { server, port } = await startServer();
  const BASE = `http://127.0.0.1:${port}${PREFIX}`;
  const browser = await chromium.launch();

  /* --- privacy, storage, layout, errors, figures ---------------------------- */

  for (const page of ['voice.html', 'index.html']) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    const tab = await ctx.newPage();
    const errors = [];
    const consoleErrors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    tab.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await tab.goto(`${BASE}/${page}`, { waitUntil: 'networkidle' });
    await tab.waitForSelector('#form:not([hidden])', { timeout: 60000 });
    // Let the worker finish installing, so its precache is not counted as
    // traffic caused by casting a chart.
    await tab.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
    await tab.waitForTimeout(600);

    const after = [];
    tab.on('request', (r) => after.push(r.url()));
    await cast(tab, { voice: page === 'voice.html' });

    // The claim is about user data, so it is checked in those terms rather than
    // as a bare request count: the worker legitimately fetches app files.
    const APP_FILE = /(\.(html|css|js|wasm|data|png|svg|webmanifest)|\/)$/;
    const crossOrigin = after.filter((u) => !u.startsWith(`http://127.0.0.1:${port}`));
    const carriesInput = after.filter((u) => u.includes('?') || u.includes('#'));
    const notAppFile = after.filter((u) => !APP_FILE.test(new URL(u).pathname));
    record('送信', `${page}: 外部オリジンへの要求は一件も無い`, crossOrigin.length === 0,
      crossOrigin.slice(0, 4).join(' '));
    record('送信', `${page}: 入力値を載せた要求が無い`, carriesInput.length === 0,
      carriesInput.slice(0, 4).join(' '));
    record('送信', `${page}: 同一オリジンの通信はアプリ自身のファイルだけ`, notAppFile.length === 0,
      `占った後の要求 ${after.length} 件、すべてアプリのファイル`);

    const storage = await tab.evaluate(() => ({
      local: localStorage.length, session: sessionStorage.length, cookies: document.cookie,
    }));
    record('保存', `${page}: 何も保存していない`,
      storage.local === 0 && storage.session === 0 && storage.cookies === '',
      JSON.stringify(storage));

    record('エラー', `${page}: ページエラーもコンソールエラーも無い`,
      errors.length === 0 && consoleErrors.length === 0,
      errors.concat(consoleErrors).slice(0, 3).join(' | '));

    if (page === 'voice.html') {
      const shape = await tab.evaluate(() => {
        const cols = [...document.querySelectorAll('.board-col')];
        const nodes = [...document.querySelectorAll('.wx-node')];
        const bars = [...document.querySelectorAll('.band-bar')];
        return {
          bullets: document.querySelectorAll('.bullet').length,
          unsourced: [...document.querySelectorAll('.bullet')]
            .filter((b) => b.querySelectorAll('.cite').length === 0).length,
          folds: document.querySelectorAll('details.gloss').length,
          gauges: document.querySelectorAll('.gauge').length,
          meters: document.querySelectorAll('[role=meter]').length,
          boardCols: cols.length,
          boardShape: [...new Set(cols.map((c) => c.children.length))],
          wuxingNodes: nodes.length,
          wuxingLabelled: nodes.filter((n) => n.querySelector('.wx-label')).length,
          keDashed: [...document.querySelectorAll('.wx-ke')]
            .every((l) => getComputedStyle(l).strokeDasharray !== 'none'),
          bandCells: bars.length,
          bandFills: new Set(bars.map((b) => getComputedStyle(b).fill)).size,
          bandLabelled: [...document.querySelectorAll('.band-cell')].every((c) => c.getAttribute('aria-label')),
        };
      });
      record('図', '目盛りが4本あり meter として印が付いている',
        shape.gauges === 4 && shape.meters === 4, `${shape.gauges}本 / meter ${shape.meters}`);
      record('図', '箇条書きはすべて出典を表示している',
        shape.bullets > 0 && shape.unsourced === 0, `${shape.bullets}件、出典なし ${shape.unsourced}`);
      record('図', '長い文章は畳まれている', shape.folds >= 5, `${shape.folds}箇所`);
      record('図', '命式の図は4列で、列の構造が揃っている',
        shape.boardCols === 4 && shape.boardShape.length === 1,
        `${shape.boardCols}列、構造 ${shape.boardShape.join('/')}`);
      record('図', '五行の5節点すべてに名前がある（色だけに頼らない）',
        shape.wuxingNodes === 5 && shape.wuxingLabelled === 5,
        `${shape.wuxingLabelled}/${shape.wuxingNodes}`);
      record('図', '相剋の線は破線のまま（描き起こしで消えていない）', shape.keDashed);
      record('図', '帯は一年ごとで、棒に五行の色を載せていない',
        shape.bandCells >= 80 && shape.bandFills <= 2,
        `${shape.bandCells}マス、棒の色 ${shape.bandFills}種（極性は位置）`);
      record('図', '帯の全マスに読み上げラベルがある', shape.bandLabelled);
    }
    await ctx.close();
  }

  /* --- 三柱・大運なしでも図が崩れない -------------------------------------- */

  for (const [name, opts] of [
    ['時刻なし（三柱）', { time: null, sex: true }],
    ['性別なし（大運なし）', { time: '06:30', sex: false }],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`${BASE}/voice.html`, { waitUntil: 'networkidle' });
    await cast(tab, { ...opts, voice: true });
    const r = await tab.evaluate(() => {
      const cols = [...document.querySelectorAll('.board-col')];
      return {
        shape: [...new Set(cols.map((c) => c.children.length))],
        cols: cols.length,
        wuxing: document.querySelectorAll('.wx-node').length,
        notice: !!document.querySelector('#output .notice'),
      };
    });
    record('欠けた入力', `${name}: 図が崩れず例外も出ない`,
      r.cols === 4 && r.shape.length === 1 && r.wuxing === 5 && !r.notice && errors.length === 0,
      `列 ${r.cols}、構造 ${r.shape.join('/')}、五行 ${r.wuxing}`
      + (errors.length ? `、例外 ${errors[0]}` : ''));
    await ctx.close();
  }

  /* --- 横幅と、動きを止めた状態 -------------------------------------------- */

  for (const [width, motion] of [[320, 'no-preference'], [320, 'reduce'], [375, 'reduce'], [768, 'no-preference']]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
    });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`${BASE}/voice.html`, { waitUntil: 'networkidle' });
    await cast(tab, { voice: true });
    const r = await tab.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      // Content inside a deliberate horizontal scroller is not page overflow —
      // the 大運 band is meant to scroll inside its own box. What must never
      // happen is the *page* scrolling sideways.
      const inScroller = (n) => {
        for (let p = n.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
        return false;
      };
      const bad = [];
      for (const n of document.querySelectorAll('*')) {
        const b = n.getBoundingClientRect();
        if (!b.width || inScroller(n)) continue;
        if (b.right > vw + 0.6 || b.left < -0.6) bad.push(n.tagName.toLowerCase());
      }
      return { vw, scroll: document.documentElement.scrollWidth, bad: [...new Set(bad)].slice(0, 5) };
    });
    record('横幅', `${width}px / motion:${motion} で横あふれが無い`,
      r.scroll <= r.vw + 1 && r.bad.length === 0 && errors.length === 0,
      `scrollWidth ${r.scroll}/${r.vw}` + (r.bad.length ? ` はみ出し: ${r.bad.join(', ')}` : ''));
    await ctx.close();
  }

  /* --- 未来の日付を二重に弾く ---------------------------------------------- */

  for (const page of ['voice.html', 'index.html']) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const tab = await ctx.newPage();
    await tab.goto(`${BASE}/${page}`, { waitUntil: 'networkidle' });
    await tab.waitForSelector('#form:not([hidden])', { timeout: 60000 });
    const native = await tab.evaluate(() => {
      const f = document.getElementById('birthdate');
      f.value = '2099-07-30';
      return { max: f.max, valid: f.checkValidity() };
    });
    // Then drop the attribute so native validation passes, and check the
    // handler refuses on its own.
    await tab.evaluate(() => {
      const f = document.getElementById('birthdate');
      f.removeAttribute('max');
      f.value = '2099-07-30';
    });
    await tab.fill('#longitude', '141.77');
    if (page === 'voice.html') await tab.click('#sex button:nth-child(1)');
    await tab.click('button[type=submit]');
    await tab.waitForTimeout(600);
    const after = await tab.evaluate(() => ({
      text: [...document.querySelectorAll('#output p')].map((x) => x.textContent).join(' '),
      rendered: !!(document.querySelector('.gauge') || document.querySelector('.chart')),
    }));
    record('未来の日付', `${page}: max 属性と JS の両方で弾く`,
      native.max && !native.valid && after.text.includes('未来') && !after.rendered,
      `max=${native.max}、属性を外しても「${after.text.trim().slice(0, 34)}」`);
    await ctx.close();
  }

  /* --- ホーム画面とオフライン ---------------------------------------------- */

  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const tab = await ctx.newPage();
    await tab.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await tab.waitForSelector('#form:not([hidden])', { timeout: 60000 });

    const sw = await tab.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, active: !!reg.active };
    });
    record('オフライン', 'service worker が、配信されているサブパスで有効になる',
      sw.active && sw.scope.endsWith(`${PREFIX}/`), `scope ${sw.scope}`);

    const cached = await tab.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys[0]);
      return { name: keys[0], n: (await c.keys()).length };
    });
    record('オフライン', '先読みが全ファイル揃っている', cached.n >= 38, `${cached.name}: ${cached.n} 件`);

    // The manifest has to resolve inside the subpath, or iOS treats a tap on the
    // footer link as leaving the app — the whole reason the manifest exists.
    const manifest = await tab.evaluate(async () => {
      const link = document.querySelector('link[rel=manifest]');
      const m = await (await fetch(link.href)).json();
      const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, link.href))).ok));
      return {
        scope: new URL(m.scope, link.href).href,
        start: new URL(m.start_url, link.href).href,
        voice: new URL('voice.html', link.href).href,
        icons,
      };
    });
    record('ホーム画面', 'サブパス配信でも語りページがスコープの中に入る',
      manifest.voice.startsWith(manifest.scope) && manifest.start.startsWith(manifest.scope),
      `scope ${manifest.scope}`);
    record('ホーム画面', '宣言したアイコンが実際に取得できる',
      manifest.icons.every(Boolean), `${manifest.icons.filter(Boolean).length}/${manifest.icons.length} 枚`);

    // Second visit: with the worker in place, nothing should touch the network.
    const fromNetwork = [];
    tab.on('response', (r) => { if (!r.fromServiceWorker()) fromNetwork.push(r.url()); });
    await tab.reload({ waitUntil: 'networkidle' });
    await tab.waitForSelector('#form:not([hidden])', { timeout: 60000 });
    record('オフライン', '2回目の表示はネットワークを使わない', fromNetwork.length === 0,
      `ネットワーク経由 ${fromNetwork.length} 件`);

    // And with the network actually off, both pages must load, navigate to each
    // other and compute — the home-screen path.
    await ctx.setOffline(true);
    await tab.reload({ waitUntil: 'domcontentloaded' });
    await cast(tab, {});
    const boardOffline = await tab.evaluate(() => !!document.querySelector('.chart'));
    record('オフライン', '通信を切っても盤ページが計算まで通る', boardOffline);

    await tab.click('footer a[href="voice.html"]');
    await tab.waitForSelector('#form:not([hidden])', { timeout: 60000 });
    await cast(tab, { voice: true });
    const voiceOffline = await tab.evaluate(() => document.querySelectorAll('.gauge').length);
    record('オフライン', '通信を切ってもページ間を移動して計算まで通る', voiceOffline === 4,
      `目盛り ${voiceOffline} 本`);
    await ctx.setOffline(false);
    await ctx.close();
  }

  await browser.close();
  server.close();

  for (const r of results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.section} :: ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failures}/${results.length} ブラウザ監査が通過`);
  if (failures > 0) {
    console.error('\nBROWSER AUDIT FAILED');
    process.exit(1);
  }
}

await main();

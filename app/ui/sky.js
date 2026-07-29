/**
 * The ground the dial sits on.
 *
 * Procedural: no image assets, so nothing is fetched (spec §7). Motion is
 * deliberately near the threshold of notice — the dial is what should hold the
 * eye — and stops entirely under prefers-reduced-motion, where the field is
 * painted once and left alone.
 */

const STAR_COUNT = 150;

export function startSky(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stars = [];
  let width = 0;
  let height = 0;
  let raf = null;

  function seed() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() < 0.86 ? 0.4 + Math.random() * 0.7 : 1.1 + Math.random() * 0.9,
      base: 0.18 + Math.random() * 0.5,
      // Period and phase of the twinkle, in seconds.
      period: 3 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
      warm: Math.random() < 0.22,
    }));
  }

  function paint(seconds) {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      const pulse = reduced.matches
        ? 1
        : 0.72 + 0.28 * Math.sin(s.phase + (seconds * 2 * Math.PI) / s.period);
      ctx.globalAlpha = Math.min(1, s.base * pulse);
      ctx.fillStyle = s.warm ? '#F0DFC0' : '#CFE0F2';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let last = 0;
  function frame(now) {
    // ~24 fps is plenty for a slow twinkle and leaves the phone alone.
    if (now - last > 41) {
      paint(now / 1000);
      last = now;
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  function start() {
    stop();
    if (reduced.matches) { paint(0); return; }
    raf = requestAnimationFrame(frame);
  }

  seed();
  start();

  window.addEventListener('resize', () => { seed(); if (reduced.matches) paint(0); });
  reduced.addEventListener('change', start);
  // Don't animate a page nobody is looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
}

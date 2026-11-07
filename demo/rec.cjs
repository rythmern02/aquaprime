// Shared recorder helpers: real Chrome, 1920×1080 video, visible cursor with eased motion + click ripples.
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "..", "frontend", "node_modules", "playwright-core"));

const W = 1920, H = 1080;
const CLIPS = path.join(__dirname, "clips");
const dur = JSON.parse(fs.readFileSync(path.join(__dirname, "audio", "durations.json"), "utf8"));

const CURSOR = `
(() => {
  if (window.__cursor) return;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(255,255,255,.92);border:2px solid #06223D;box-shadow:0 4px 14px rgba(6,34,61,.35);' +
      'z-index:2147483647;pointer-events:none;transition:transform .12s ease;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(c);
    window.__cursor = c;
    let x = -100, y = -100;
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
    addEventListener('mousedown', () => {
      c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(.75)';
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;' +
        'border:3px solid #0B7FE8;z-index:2147483646;pointer-events:none;opacity:.9;transition:all .55s ease-out';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(5)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 650);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();`;

async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: process.env.HEADED ? false : true,
    args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-device-scale-factor=1"],
  });
}

async function segment(browser, name, fn) {
  const dir = path.join(CLIPS, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const created = Date.now();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  let mx = W / 2, my = H / 2;
  let markAt;
  const h = {
    page, ctx,
    /** call when the shot is ready — everything before it is trimmed off */
    mark() { markAt = Date.now(); },
    wait: (ms) => page.waitForTimeout(ms),
    /** eased cursor path */
    async move(x, y, ms = 700) {
      const steps = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
        await page.waitForTimeout(ms / steps);
      }
      mx = x; my = y;
    },
    async to(locator, ms = 700) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const b = await locator.boundingBox();
      if (!b) throw new Error("no box for locator");
      await h.move(b.x + b.width / 2, b.y + b.height / 2, ms);
      return b;
    },
    async click(locator, ms = 700) { await h.to(locator, ms); await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); },
    /** smooth scroll to an absolute y over ms */
    async scrollTo(y, ms = 1400) {
      await page.evaluate(({ y, ms }) => new Promise((res) => {
        document.documentElement.style.scrollBehavior = "auto";
        const y0 = scrollY, t0 = performance.now();
        const f = (now) => { const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; scrollTo(0, y0 + (y - y0) * e); t < 1 ? requestAnimationFrame(f) : res(); };
        requestAnimationFrame(f);
      }), { y, ms });
    },
    async scrollToEl(sel, offset = -80, ms = 1400) {
      const y = await page.evaluate(({ sel, offset }) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + scrollY + offset : scrollY; }, { sel, offset });
      await h.scrollTo(y, ms);
    },
  };
  await fn(h);
  const t0 = markAt ?? created;
  // hold until the narration for this segment is covered (+ tail)
  const need = ((dur[name.replace(/^\d+-/, "")] ?? 0) + 0.9) * 1000 - (Date.now() - t0);
  if (need > 0) await page.waitForTimeout(need);
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const out = path.join(CLIPS, `${name}.webm`);
  fs.renameSync(src, out);
  // keep recordings of any popups opened during the segment
  fs.readdirSync(dir).filter((f) => f.endsWith(".webm")).forEach((f, i) => fs.renameSync(path.join(dir, f), path.join(CLIPS, `${name}-popup-${i}.webm`)));
  fs.writeFileSync(path.join(CLIPS, `${name}.json`), JSON.stringify({ trim: Math.max(0, (t0 - created) / 1000), length: (Date.now() - t0) / 1000 }));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`clip ${name} → trim ${((t0 - created) / 1000).toFixed(1)}s`);
  return out;
}

module.exports = { launch, segment, W, H, dur };

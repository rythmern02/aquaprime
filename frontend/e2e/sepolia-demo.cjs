// Hosted judge flow on the Sepolia demo market, in real Chrome, no wallet:
// start session → position reset on-chain → crash ETH → ship 0xf0 auction → denied 403 → approve on the
// hosted test IdP page → surgical rescue in one Sepolia tx → HF back to ~1.02.
// Usage: npm run demo:sepolia (other terminal), then  BASE=http://localhost:3005 npm run test:e2e:sepolia
const { chromium } = require("playwright-core");
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("✔ " + m); };
const BASE = process.env.BASE || "http://localhost:3005";

(async () => {
  const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const b = await chromium.launch({ executablePath: chrome, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  // This test covers the demo/keeper/IdP flow on Sepolia. Browser reads use the explicit "direct RPC" opt-out by
  // default because the public Nox testnet mixnet can be degraded; READS=anon forces mixnet reads instead.
  if (process.env.READS !== "anon") await ctx.addInitScript(() => localStorage.setItem("aquaprime.readMode", "direct-optout"));
  const p = await ctx.newPage();
  globalThis.__page = p;
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const t0 = Date.now(); const ts = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  const activity = () => p.locator("[aria-label='Your position'] [aria-live=polite] li").allTextContents();
  const waitLog = async (re, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { const hit = (await activity()).find((x) => re.test(x)); if (hit) return hit; await p.waitForTimeout(1000); } throw new Error(`timeout waiting for ${re}\n${(await activity()).join("\n")}`); };
  const hf = async () => (await p.locator("[aria-label='Your position'] [role=img]").getAttribute("aria-label")) || "";
  const waitHf = async (re, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await hf(); if (re.test(v)) return v; await p.waitForTimeout(1500); } throw new Error(`HF never matched ${re}: ${await hf()}`); };

  await p.goto(`${BASE}/app`);
  await p.getByRole("button", { name: /Start a live rescue/ }).click({ timeout: 60000 });
  await p.getByRole("heading", { name: "Crash ETH" }).waitFor({ timeout: 240000 });
  const steps = await p.locator("ol[aria-live=polite] li").allTextContents().catch(() => []);
  console.log(`  [${ts()}] session ready`);
  const hf0 = await waitHf(/1\.(0[89]|1[0-3])/, 300000);
  assert(true, `demo position reset on Sepolia (${hf0})`);

  // crash below the liquidation price
  const liq = await p.locator("text=/liq\\. price/i").locator("..").innerText().catch(() => "");
  const px = Number((liq.match(/\$([\d,]+)/)?.[1] || "0").replace(/,/g, "")) || 0;
  const target = px ? Math.floor(px * 0.95 / 10) * 10 : 1500;
  await p.locator("#px").fill(String(target));
  await p.getByRole("button", { name: /(Push|Crash ETH to) \$/ }).click();
  await waitLog(/oracle →/);
  await p.getByRole("heading", { name: "Rescue" }).waitFor({ timeout: 60000 });
  assert(/0\.\d+/.test(await waitHf(/Health factor 0\.\d+/)), `crash on Sepolia (${await hf()}, ETH → $${target})`);

  await p.getByRole("button", { name: /Ship 0xf0 auction/ }).click();
  await waitLog(/shipped the 0xf0-guarded/);
  console.log(`  [${ts()}] auction shipped`);
  await p.getByRole("button", { name: /Test denied path/ }).click({ timeout: 60000 });
  assert(/HTTP 403/.test(await waitLog(/HTTP 403/)), "denied path → HTTP 403, nothing executed");

  const popupP = ctx.waitForEvent("page");
  await p.getByRole("button", { name: /Approve & rescue/ }).click();
  const popup = await popupP;
  await popup.waitForLoadState();
  assert(/not World/i.test(await popup.textContent("body")), "hosted test IdP page is clearly labelled not-World");
  await popup.getByRole("link", { name: /Approve as operator/ }).click();
  const fill = await waitLog(/Surgical fill executed/, 180000);
  assert(true, `approved → surgical fill on Sepolia: ${fill.replace(/\s+/g, " ").slice(0, 120)}`);
  assert(/1\.0[1-3]/.test(await waitHf(/1\.0[1-3]/, 120000)), `HF restored (${await hf()})`);
  assert(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  console.log(`  total ${ts()}`);
  await endSession(p);
  await b.close();
})().catch(async (e) => { console.error("FAILED", e.message); await endSession(globalThis.__page).catch(() => {}); process.exit(1); });

// always hand the single demo lease back so the next judge (or test) isn't blocked for 10 minutes
async function endSession(page) {
  if (!page) return;
  const lease = await page.evaluate(() => sessionStorage.getItem("aquaprime.demoLease")).catch(() => null);
  if (!lease) return;
  await fetch(`${BASE}/api/demo/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end", leaseId: JSON.parse(lease).id }) });
  console.log("  session ended");
}

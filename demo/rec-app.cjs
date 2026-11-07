// One continuous take of the full lifecycle on the local chain, split later into beats.
// Beats: lend → borrow → world (real World ID staging proof via the official simulator) → crash → rescue → inspect.
const path = require("path");
const fs = require("fs");
const { launch, segment, dur } = require("./rec.cjs");
const URL = process.env.BASE || "http://localhost:3000";
const CLIPS = path.join(__dirname, "clips");

(async () => {
  const b = await launch();
  const beats = {}; let popupInfo = null; const facts = {};
  await segment(b, "05-app", async (h) => {
    const p = h.page;
    const created = Date.now();
    let beatStart = 0, beatName = null;
    const beat = async (name) => {
      if (beatName) { const need = (dur[beatName] + 0.7) * 1000 - (Date.now() - beatStart); if (need > 0) await h.wait(need); }
      beatName = name; beatStart = Date.now(); beats[name] = (beatStart - created) / 1000;
    };
    const log = () => p.locator("[aria-label='Your position'] [aria-live=polite] li").allTextContents();
    const waitLog = async (re, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { const hit = (await log()).find((x) => re.test(x)); if (hit) return hit; await h.wait(400); } throw new Error("timeout " + re + "\n" + (await log()).join("\n")); };
    const hf = async () => (await p.locator("[aria-label='Your position'] [role=img]").getAttribute("aria-label")) || "";

    await p.goto(URL + "/app"); await h.wait(2500);
    await p.mouse.move(960, 700);
    h.mark();

    // ── lend
    await beat("lend");
    await h.click(p.getByRole("button", { name: /Borrower demo wallet/ }), 900);
    await p.getByRole("heading", { name: "Lend" }).waitFor();
    await h.wait(900);
    for (const name of [/Prime Credit Line/, /Liquidation Backstop/, /XYC AMM/]) { await h.to(p.getByText(name).first(), 900); await h.wait(700); }

    // ── borrow
    await beat("borrow");
    await h.click(p.getByRole("button", { name: /Next: borrow/ }), 800);
    await h.wait(500);
    await h.click(p.getByRole("button", { name: /Deposit & borrow/ }), 900);
    await waitLog(/Borrowed .* USDC/);
    await h.wait(800);
    facts.hfBorrow = await hf();
    await h.to(p.locator("[aria-label='Your position'] [role=img]"), 900);

    // ── world
    await beat("world");
    await p.getByRole("heading", { name: "Prove human" }).waitFor({ timeout: 15000 }).catch(async () => { await h.click(p.getByRole("button", { name: /Prove human/ })); });
    await h.click(p.getByRole("button", { name: /Verify with World ID/ }), 900);
    const sim = p.getByRole("link", { name: /Open World ID Simulator/ });
    await p.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => /Open World ID Simulator/.test(a.textContent) && a.href.includes("connect_url")), null, { timeout: 30000 });
    await h.wait(900);
    const popupP = h.ctx.waitForEvent("page");
    await h.click(sim, 900);
    const pop = await popupP;
    popupInfo = { opened: (Date.now() - created) / 1000, page: pop };
    await pop.waitForLoadState("domcontentloaded");
    await pop.waitForTimeout(2500);
    // approve in the official simulator: wait for the loaded request, glide to Continue, click
    const cont = pop.getByRole("button", { name: /^Continue$/ });
    await cont.waitFor({ timeout: 30000 });
    await pop.waitForTimeout(1800);
    const cb = await cont.boundingBox();
    await pop.mouse.move(1200, 300);
    for (let i = 1; i <= 40; i++) { const t = i / 40, e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; await pop.mouse.move(1200 + (cb.x + cb.width / 2 - 1200) * e, 300 + (cb.y + cb.height / 2 - 300) * e); await pop.waitForTimeout(18); }
    await pop.waitForTimeout(250); await pop.mouse.down(); await pop.waitForTimeout(90); await pop.mouse.up();
    for (let i = 0; i < 40; i++) { if ((await log()).some((x) => /Human Prime tier unlocked|World rejected|not completed/.test(x))) break; await pop.waitForTimeout(500); }
    await pop.waitForTimeout(1200);
    popupInfo.closed = (Date.now() - created) / 1000;
    await pop.close().catch(() => {});
    await p.bringToFront();
    facts.world = (await waitLog(/Human Prime tier unlocked|World rejected|not completed/, 60000));
    await h.wait(900);

    // ── crash: switch to the anonymous, pre-opened position (HF 1.11) for the liquidation story
    await beat("crash");
    await h.click(p.getByRole("button", { name: /Demo borrower/ }).first(), 800);
    await h.click(p.getByRole("button", { name: /Underwater-ready demo wallet/ }), 900);
    await p.getByRole("heading", { name: "Lend" }).waitFor();
    await h.wait(500);
    await h.click(p.getByRole("button", { name: /Crash ETH/ }).first(), 800);
    await p.getByRole("heading", { name: "Crash ETH" }).waitFor();
    // pick a price that lands HF ≈ 0.957 for whichever tier we're in
    const human = /Human/.test(await p.locator("[aria-label='Your position']").innerText());
    const target = human ? 1650 : 2150;
    facts.crashPrice = target; facts.human = human;
    const slider = p.locator("#px");
    const sb = await h.to(slider, 900);
    // glide the thumb down to the target through real input events (React sees every step)
    const from = Number(await slider.inputValue());
    await p.evaluate(async ({ from, to }) => {
      const el = document.querySelector("#px");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      for (let i = 1; i <= 45; i++) {
        const v = Math.round((from + (to - from) * (1 - Math.pow(1 - i / 45, 2))) / 10) * 10;
        set.call(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
      }
    }, { from, to: target });
    const pct = (target - 1200) / 2000;
    await h.move(sb.x + sb.width * pct, sb.y + sb.height / 2, 500);
    await h.wait(700);
    await h.click(p.getByRole("button", { name: /(Push|Crash ETH to) \$/ }), 900);
    await waitLog(/oracle →/);
    await p.getByRole("heading", { name: "Rescue" }).waitFor({ timeout: 20000 });
    await h.wait(1200);
    facts.hfCrash = await hf();

    // ── rescue
    await beat("rescue");
    await h.click(p.getByRole("button", { name: /Ship 0xf0 auction/ }), 800);
    await waitLog(/shipped the 0xf0-guarded/);
    beats.ship = (Date.now() - created) / 1000;
    const skip = p.getByRole("button", { name: /Skip 3-min grace/ });
    if (await skip.isVisible().catch(() => false)) { await h.click(skip, 700); await waitLog(/grace window over/); await h.wait(1500); }
    await h.click(p.getByRole("button", { name: /Test denied path/ }), 800);
    await waitLog(/HTTP 403/);
    beats.denied = (Date.now() - created) / 1000;
    await h.wait(1200);
    await h.click(p.getByRole("button", { name: /Approve & rescue/ }), 800);
    beats.approve = (Date.now() - created) / 1000;
    facts.fill = await waitLog(/Surgical fill executed/, 60000);
    beats.filled = (Date.now() - created) / 1000;
    await h.wait(2500);
    facts.hfAfter = await hf();
    facts.card = await p.locator("text=/legacy close-factor/i").first().innerText().catch(() => "");
    await h.to(p.locator("text=/WETH you keep/i").first(), 1000).catch(() => {});

    // ── inspect
    await beat("inspect");
    await h.click(p.getByRole("button", { name: /Inspect the VM/ }), 900);
    await p.getByRole("dialog", { name: "SwapVM inspector" }).waitFor();
    await h.wait(800);
    await h.to(p.getByText("OracleBackstopBid").first(), 1100);
    await h.wait(dur.inspect * 1000 * 0.5);
  });
  // the popup's own recording, aligned by wall-clock offset from the main page
  if (popupInfo) delete popupInfo.page; // its video lands in clips/05-app-popup-0.webm
  fs.writeFileSync(path.join(CLIPS, "05-app.beats.json"), JSON.stringify({ beats, popup: popupInfo, facts }, null, 1));
  console.log(JSON.stringify({ beats, popup: popupInfo, facts }, null, 1));
  await b.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });

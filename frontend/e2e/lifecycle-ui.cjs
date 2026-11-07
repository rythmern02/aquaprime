const { chromium } = require("playwright-core");
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("✔ " + m); };
(async () => {
  const out = process.argv[2] || require("os").tmpdir();
  const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const b = await chromium.launch({ executablePath: chrome, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const activity = () => p.locator("[aria-live=polite] li").allTextContents();
  const waitLog = async (re, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const l = await activity(); const hit = l.find((x) => re.test(x)); if (hit) return hit; await p.waitForTimeout(500); } throw new Error("timeout waiting for " + re + "\n" + (await activity()).join("\n")); };
  const hfText = async () => (await p.locator("[aria-label='Your position'] [role=img]").getAttribute("aria-label"));

  await p.goto((process.env.APP_URL || "http://localhost:3000") + "/app", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Borrower demo wallet/ }).click();
  await p.getByRole("heading", { name: "Lend" }).waitFor();
  assert(await p.getByText("Prime Credit Line").isVisible(), "step 1 shows the maker's three live strategies");
  await p.getByRole("button", { name: /Next: borrow/ }).click();

  await p.locator("#coll").fill("10");
  await p.locator("#borrow").fill("15000");
  await p.getByRole("button", { name: /Deposit & borrow/ }).click();
  assert(/Borrowed 15000 USDC/.test(await waitLog(/Borrowed 15000 USDC/)), "deposit + borrow executed; USDC pulled via aqua.pull");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/u-borrow.png` });
  assert(/1\.11/.test(await hfText()), `HF after borrow ≈ 1.11 (${await hfText()})`);

  await p.getByRole("button", { name: /Crash ETH/ }).click();
  await p.locator("#px").fill("2150");
  await p.getByRole("button", { name: /(Push \$2,150 on-chain|Crash ETH to \$2,150)/ }).click();
  await waitLog(/oracle → \$2,150/);
  await p.getByRole("heading", { name: "Rescue" }).waitFor();
  await p.waitForTimeout(1500);
  assert(/0\.95/.test(await hfText()), `HF after crash < 1 (${await hfText()})`);

  await p.getByRole("button", { name: /Ship 0xf0 auction/ }).click();
  await waitLog(/shipped the 0xf0-guarded/);
  await p.getByRole("button", { name: /Test denied path/ }).click();
  assert(/HTTP 403 — Action blocked/.test(await waitLog(/HTTP 403/)), "denied path → HTTP 403, nothing executed");
  await p.waitForTimeout(1000);
  await p.getByRole("button", { name: /Approve & rescue/ }).click();
  assert(/Surgical fill executed/.test(await waitLog(/Surgical fill executed/, 45000)), "approved path → surgical fill in one tx");
  await p.waitForTimeout(2500);
  assert(/1\.02/.test(await hfText()), `HF restored to 1.02 (${await hfText()})`);
  await p.screenshot({ path: `${out}/u-rescued.png` });

  await p.getByRole("button", { name: /Inspect the VM/ }).click();
  await p.getByRole("dialog", { name: "SwapVM inspector" }).waitFor();
  assert(await p.getByText("OracleBackstopBid").first().isVisible(), "VM inspector decodes the 0xf1 custom opcode");
  await p.screenshot({ path: `${out}/u-vm.png` });
  assert(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

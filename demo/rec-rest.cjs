const { launch, segment } = require("./rec.cjs");
const only = process.argv[2];
const REG = "0x5274de7873D7381Ff55b6DFd81De2550dd92dE41";      // canonical Sepolia registry
const DEMO_REG = "0xbA67558c205EcDC84898c3b069d4F0280b10F100"; // labelled demo market registry

(async () => {
  const b = await launch();
  const run = (name, fn) => (!only || name.includes(only) ? segment(b, name, fn).catch((e) => console.error(name, "FAILED", e.message)) : null);

  await run("11-sepolia", async (h) => {
    const p = h.page;
    // hosted-mode app first so the mixnet has time to connect before we show it
    const app = await h.ctx.newPage();
    await app.goto("http://localhost:3005/", { timeout: 90000 }).catch(() => {});
    await p.goto(`https://repo.sourcify.dev/11155111/${REG}`, { timeout: 45000 }).catch(() => {});
    await h.wait(3000);
    h.mark();
    await h.move(900, 420, 1400); await h.wait(1600);
    await h.scrollTo(380, 1600); await h.wait(1400);
    await p.goto(`https://sepolia.etherscan.io/address/${DEMO_REG}`, { timeout: 45000 }).catch(() => {});
    await h.wait(2500);
    await h.move(1000, 600, 1400); await h.scrollTo(520, 1600); await h.wait(1500);
    // the hosted app: wait for the Anon-RPC pill to be connected, then show it
    for (let i = 0; i < 40; i++) { const t = (await app.locator("header").innerText().catch(() => "")); if (/Anon-RPC/.test(t) && !/down|Joining/.test(t)) break; await app.waitForTimeout(1000); }
    await p.goto("http://localhost:3005/", { timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 40; i++) { const t = (await p.locator("header").innerText().catch(() => "")); if (/Anon-RPC/.test(t) && !/down|Joining/.test(t)) break; await h.wait(1000); }
    await app.close();
    const pill = p.getByRole("button", { name: /Anon-RPC/ }).first();
    await h.click(pill, 1200).catch(() => {});
    await h.wait(3500);
  });

  await run("12-trust", async (h) => {
    await h.page.goto("http://localhost:3000/pitch#7"); await h.wait(2500);
    h.mark();
    await h.move(800, 500, 1500); await h.wait(6000);
    await h.page.keyboard.press("ArrowRight"); await h.wait(800);
    await h.move(1150, 560, 1500);
  });

  await run("13-close", async (h) => {
    await h.page.goto("http://localhost:3000/pitch#10"); await h.wait(2500);
    h.mark();
    await h.move(700, 520, 2000);
  });

  await b.close();
})();

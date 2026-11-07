const { launch, segment } = require("./rec.cjs");
const URL = process.env.BASE || "http://localhost:3000";
const only = process.argv[2];

(async () => {
  const b = await launch();
  const run = (name, fn) => (!only || name.includes(only) ? segment(b, name, fn) : null);

  await run("01-hook", async (h) => {
    await h.page.goto(URL + "/"); await h.wait(3800);
    await h.page.mouse.move(380, 980);
    h.mark();
    await h.move(700, 820, 2600); await h.move(1150, 900, 2800); await h.move(1500, 780, 2600);
    await h.move(1100, 700, 2600); await h.move(620, 860, 2800);
  });

  await run("02-field", async (h) => {
    await h.page.goto(URL + "/"); await h.wait(2500);
    const y = await h.page.evaluate(() => { const el = [...document.querySelectorAll("h2")].find((x) => /Liquidity is a/.test(x.textContent)); return el.closest("section").getBoundingClientRect().top + scrollY; });
    await h.page.evaluate((y) => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, y); }, y);
    await h.wait(1600);
    await h.page.mouse.move(900, 300);
    h.mark();
    await h.move(1150, 420, 1500); await h.move(1350, 560, 1300);
    await h.page.mouse.down(); await h.page.mouse.up(); await h.wait(700);
    await h.move(900, 640, 1600); await h.page.mouse.down(); await h.page.mouse.up(); await h.wait(600);
    await h.move(1250, 300, 1700); await h.move(1500, 480, 1500);
  });

  await run("03-sim", async (h) => {
    await h.page.goto(URL + "/"); await h.wait(2500);
    await h.page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; const el = document.querySelector("#how"); scrollTo(0, el.getBoundingClientRect().top + scrollY - 60); });
    await h.wait(1500);
    h.mark();
    // the scalpel card: toggle legacy vs surgical
    await h.click(h.page.getByRole("radio", { name: /Legacy 50%/ }), 900); await h.wait(900);
    await h.click(h.page.getByRole("radio", { name: /0xf0 surgical/ }), 700); await h.wait(500);
    await h.scrollToEl("#simulator", -30, 1300);
    await h.wait(400);
    const slider = h.page.locator("input[type=range]").first();
    console.log("ranges", await h.page.locator("input[type=range]").count());
    const bx = await slider.boundingBox();
    const at = (pct) => bx.x + bx.width * pct;
    await h.move(at(0.7), bx.y + bx.height / 2, 800);
    await h.page.mouse.down();
    for (let i = 0; i <= 50; i++) { await h.page.mouse.move(at(0.7 - 0.38 * (i / 50)), bx.y + bx.height / 2); await h.wait(45); }
    await h.page.mouse.up();
    // land exactly on $1,900 (the narrated case) with the keyboard, one $10 step at a time
    console.log("after drag", await slider.inputValue({ timeout: 3000 }));
    for (let k = 0; k < 40; k++) {
      const v = Number(await slider.inputValue({ timeout: 3000 }));
      if (v === 1900) break;
      await h.page.keyboard.press(v > 1900 ? "ArrowLeft" : "ArrowRight"); await h.wait(35);
    }
    console.log("final", await slider.inputValue({ timeout: 3000 }));
    await h.wait(500);
    await h.move(1250, 760, 1200);
  });

  await run("04-vm", async (h) => {
    await h.page.goto(URL + "/"); await h.wait(2500);
    const y = await h.page.evaluate(() => { const el = [...document.querySelectorAll("h2")].find((x) => /The rule lives/.test(x.textContent)); return el.closest("section").getBoundingClientRect().top + scrollY - 20; });
    await h.page.evaluate((y) => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, y); }, y);
    await h.wait(1500);
    h.mark();
    await h.click(h.page.getByRole("button", { name: /SolvencyDutchGuard/ }), 1000); await h.wait(2200);
    await h.click(h.page.getByRole("button", { name: /Post-curve check/ }), 900); await h.wait(2000);
    await h.scrollToEl("#live", -40, 1600);
    await h.move(1300, 520, 1200);
  });

  await b.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });

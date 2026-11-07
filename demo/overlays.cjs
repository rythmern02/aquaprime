// Renders title/end cards and lower-third captions as PNGs (transparent where needed).
const path = require("path");
const fs = require("fs");
const { launch } = require("./rec.cjs");
const OUT = path.join(__dirname, "overlays");

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;
const BASE = `*{box-sizing:border-box;margin:0}body{width:1920px;height:1080px;font-family:'Instrument Sans',system-ui;color:#06223D;-webkit-font-smoothing:antialiased}
.mono{font-family:'IBM Plex Mono',monospace}.serif{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}`;
const SKY = `background:radial-gradient(60% 50% at 78% 18%,rgba(255,255,255,.95),rgba(255,255,255,0) 60%),linear-gradient(180deg,#7EC8F8 0%,#B4E0FC 34%,#E3F4FF 56%,#F4F9FE 100%);`;
const WAVES = `<svg viewBox="0 0 1920 300" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:1920px;height:300px">
<path d="M0 120 C 300 70 600 170 960 120 S 1620 70 1920 120 V300 H0Z" fill="#7CCBF0" opacity=".85"/>
<path d="M0 160 C 320 110 640 210 960 160 S 1600 110 1920 160 V300 H0Z" fill="#2FA8DD" opacity=".9"/>
<path d="M0 200 C 300 160 640 250 960 200 S 1620 160 1920 200 V300 H0Z" fill="#0B7FE8"/>
<path d="M0 240 C 320 210 640 280 960 240 S 1600 210 1920 240 V300 H0Z" fill="#0A4A85"/></svg>`;
const MARK = (s = 44) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20"><path d="M1.5 1.5h17v11l-6 6h-11z" fill="none" stroke="#06223D" stroke-width="1.5"/><path d="M14 14h4.5L14 18.5z" fill="#1FC2E3"/></svg>`;

const cards = {
  title: `<body style="${SKY}position:relative;overflow:hidden">
    <div style="position:absolute;left:150px;top:150px;display:flex;align-items:center;gap:16px;font-size:34px;font-weight:600">${MARK(46)} AquaPrime</div>
    <div style="position:absolute;left:150px;top:300px;font-size:168px;font-weight:500;letter-spacing:-.04em;line-height:.9">Your capital<br><span class="serif" style="color:#0A4A85">never</span> leaves.</div>
    <div style="position:absolute;left:150px;top:660px;font-size:34px;color:#284863;max-width:1300px;line-height:1.35">Zero-custody prime credit with surgical liquidations</div>
    <div class="mono" style="position:absolute;left:150px;top:730px;font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:#4F6B85">1inch Aqua × SwapVM · World ID · EF Anon-RPC</div>
    ${WAVES}</body>`,
  end: `<body style="${SKY}position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:190px;text-align:center">
      <div style="display:flex;align-items:center;gap:16px;font-size:40px;font-weight:600">${MARK(54)} AquaPrime</div>
      <div style="margin-top:46px;font-size:120px;font-weight:500;letter-spacing:-.04em;line-height:.95">Your capital <span class="serif" style="color:#0A4A85">never</span> leaves.</div>
      <div style="margin-top:46px;font-size:30px;color:#284863">Rythme Nagrani · Co-Founder, Web3Spell Labs</div>
      <div class="mono" style="margin-top:22px;font-size:24px;color:#0B7FE8">github.com/rythmern02/treaz</div>
    </div>${WAVES}</body>`,
};

// [file, kicker, text]
const captions = [
  ["c-problem", "The problem", "$50.2B locked in lending pools · 50–100% sold per liquidation"],
  ["c-field", "1inch Aqua", "Virtual balances — $0 locked, tokens move only on a fill"],
  ["c-sim", "Same math as the contract", "AquaPrime sells only the slice that restores HF 1.02"],
  ["c-vm", "Custom SwapVM opcode 0xf0", "Over-liquidation is impossible by construction"],
  ["c-local", "Full lifecycle · local Hardhat chain", "One wallet · 3 strategies · 3× capital efficiency"],
  ["c-borrow", "aqua.pull", "USDC moves lender wallet → borrower in one transaction"],
  ["c-world", "World ID · staging simulator", "Human tier: 115% collateral + 3-minute grace"],
  ["c-crash", "Operator price feed (local chain)", "ETH → $1,650 · health 0.957"],
  ["c-403", "Agent Pass · human in the loop", "No fresh approval → HTTP 403, no transaction built"],
  ["c-idp", "Approval via local test IdP — not World", "World Agent Pass allow-listing pending · same OIDC checks"],
  ["c-rescue", "One-transaction surgical rescue", "Health 0.957 → 1.020 · lender repaid via aqua.push"],
  ["c-sepolia", "Sepolia · labelled demo market (operator oracle)", "Canonical 1inch Aqua · real WETH & Circle USDC"],
  ["c-anon", "EF Anon-RPC", "Every browser read through the Nox mixnet · fail-closed"],
  ["c-biz", "Business", "10% reserve factor · 0.5% liquidation fee · 0 capital locked"],
];
const cap = (k, t) => `<body style="background:transparent;position:relative">
  <div style="position:absolute;left:72px;bottom:70px;display:flex;align-items:stretch;border-radius:22px;overflow:hidden;box-shadow:0 18px 40px -12px rgba(6,34,61,.45)">
    <div style="width:10px;background:linear-gradient(#1FC2E3,#0B7FE8)"></div>
    <div style="background:rgba(6,34,61,.94);padding:20px 30px 22px 26px">
      <div class="mono" style="font-size:17px;letter-spacing:.1em;text-transform:uppercase;color:#7CCBF0">${k}</div>
      <div style="margin-top:6px;font-size:33px;font-weight:500;color:#fff;letter-spacing:-.01em">${t}</div>
    </div></div></body>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (name, body, transparent) => {
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}</style></head>${body}</html>`, { waitUntil: "load", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: !!transparent });
  };
  for (const [n, body] of Object.entries(cards)) await shot(n, body, false);
  for (const [n, k, t] of captions) await shot(n, cap(k, t), true);
  await b.close();
  console.log("overlays:", fs.readdirSync(OUT).length);
})();

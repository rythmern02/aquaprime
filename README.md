# AquaPrime: Zero-Custody Prime Credit & Surgical Liquidations

![AquaPrime Cover](./cover.jpg)

**Lenders never deposit. Borrowers are never wiped out. Liquidation quotes never leak.**

![AquaPrime Interface](./preview.png)

AquaPrime is a credit market built on **1inch Aqua + SwapVM**. LP capital stays in the LP's own wallet and is
`aqua.pull()`ed only at the moment a loan is drawn. When a position goes underwater, the registry ships a
**custom SwapVM program (opcode `0xf0`)** that auctions *only the exact slice of collateral* needed to restore
solvency. **World ID** gives verified humans a cheaper collateral tier and gates the keeper agent behind a fresh human
approval. All reads go through **EF Anon-RPC**, so RPC providers can't front-run liquidations.

| | Aave / Compound / Morpho | AquaPrime |
|---|---|---|
| LP capital | locked in a pool contract | stays in LP wallet (Aqua virtual balances), reusable across strategies |
| Liquidation size | fixed close factor (50% to 100%) | exact slice that restores HF to 1.02, enforced inside the VM |
| Liquidation price | fixed penalty (5% to 10%) | Dutch auction ramping 1.5% -> 6% |
| Who absorbs collateral | liquidator inventory | LP wallets via an oracle-priced SwapVM bid (`0xf1`) with zero-capital keepers |
| Sybil handling | everyone at 150%+ | World ID Proof of Human -> 115% + 3-minute grace window |
| Quote privacy | public RPC sees every `eth_call` | Anon-RPC by default |

---

## How it works

```mermaid
flowchart LR
  subgraph LP wallet (custody never moves)
    U[100k USDC + WETH]
  end
  U -- aqua.ship --> A[Strategy A<br/>Credit line<br/>app = CreditPositionRegistry]
  U -- aqua.ship --> B[Strategy B<br/>Backstop bid 0xf1<br/>app = AquaPrimeRouter]
  U -- aqua.ship --> C[Strategy C<br/>XYC AMM<br/>app = AquaPrimeRouter]
  Borrower -- deposit WETH / borrow --> R[CreditPositionRegistry]
  A -- aqua.pull USDC → borrower --> Borrower
  R -- HF<1: aqua.ship 0xf0 auction --> X[Registry-owned SwapVM order]
  K[Keeper agent] -- Agent Pass human approval --> E[LiquidationExecutor]
  E -- swap: fill 0xf0 slice --> X
  E -- nested swap: sell WETH --> B
  X -- postTransferIn hook --> R
  R -- aqua.push repayment --> A
```

1. **Maker / SLAC.** One wallet backs three live strategies (credit line, liquidation backstop, AMM) with no tokens
   transferred: `SLAC = Σ virtual allocations / wallet balance` (3.0x in the seeded demo).
2. **Borrow.** `registry.borrow()` calls `aqua.pull(lender, creditLine, USDC, amount, borrower)`, so USDC goes straight
   from the lender wallet to the borrower. Repayments `aqua.push()` principal and interest back into the credit line, which restores
   lending capacity.
3. **Tiers.** Anonymous wallets borrow at 150% collateral. A World ID Proof of Human (bound to the wallet, verified by the
   backend with the World Developer Portal, attested on-chain via EIP-712, nullifier → one wallet forever) unlocks
   **115% plus a 180 s grace window**.
4. **Surgical liquidation.** When HF < 1, anyone can call `startAuction`. The registry becomes an Aqua maker and ships a
   SwapVM order whose program is `[0xf0 SolvencyDutchGuard] → [0x19 LimitSwap1D] → [0x14 salt]`. Opcode `0xf0`:
   * reverts unless HF < 1.0 (`PositionHealthy`) and the human grace window has passed (`HumanGracePeriodActive`),
   * overwrites `balanceIn` and `balanceOut` with the exact debt and collateral slice that brings HF to **1.02**, priced at the live
     Dutch discount,
   * runs the rest of the program (the curve) *inside* the guard, then re-checks that the taker got no more than the cap
     (`SurgicalCapExceeded`).

   The solved slice: `x = (T·R·D − V)(1−d) / (T·R(1−d) − (1+f))`, where T = target HF, R = tier ratio, D = debt,
   V = collateral value, d = Dutch discount, f = protocol fee.
5. **Zero-capital keeper.** `LiquidationExecutor` fills the `0xf0` order. In SwapVM's pre-transfer-in callback it sells
   the seized WETH into an LP **backstop strategy (opcode `0xf1`, oracle −1%, whitelisted to the executor)**:
   USDC is `aqua.pull()`ed from the LP wallet and WETH `aqua.push()`ed into it. The executor then `aqua.push()`es the
   repayment into the registry strategy. The registry's maker hook repays the lender through Aqua and sends the
   protocol fee to the treasury. The keeper keeps the spread.
6. **Human in the loop.** The keeper agent (`agent/keeper.ts`, deterministic, no LLM) ships auctions on its own
   (permissionless housekeeping), then **pauses**. The fill only executes after a fresh **World ID Agent Pass** approval
   (OIDC step-up, `max_age=0`), validated server-side and consumed atomically.

### Business model

| Revenue line | Mechanism | Default |
|---|---|---|
| Reserve factor | share of every interest payment → treasury | 10% of interest |
| Liquidation protocol fee | taken from seized collateral → treasury | 0.5% of seized WETH |
| LP yield (not protocol revenue, the LP's pitch) | credit-line APR + backstop discount + AMM fees, all on the *same* capital | 8% APR, 1%, 0.3% |

Expansion: per-asset markets (wstETH, cbBTC), sell keeper-as-a-service to other Aqua makers, and let institutional LPs run
the backstop from MPC wallets without ever depositing.

---

## Repository map

| Path | What |
|---|---|
| [`contracts/opcodes/SolvencyDutchGuard.sol`](contracts/opcodes/SolvencyDutchGuard.sol) | **Custom opcode 0xf0** |
| [`contracts/opcodes/OracleBackstopBid.sol`](contracts/opcodes/OracleBackstopBid.sol) | **Custom opcode 0xf1** |
| [`contracts/AquaPrimeRouter.sol`](contracts/AquaPrimeRouter.sol) | Redeployed SwapVM (official engine), `_dispatch` override, AquaOpcodes-compatible table (+LimitSwap, Whitelist), under EIP-170 |
| [`contracts/CreditPositionRegistry.sol`](contracts/CreditPositionRegistry.sol) | Aqua app (credit lines), collateral, World ID tiers, auctions, SwapVM maker hook, revenue |
| [`contracts/LiquidationExecutor.sol`](contracts/LiquidationExecutor.sol) | Zero-capital flash liquidation across two SwapVM orders |
| [`contracts/StrategyBuilder.sol`](contracts/StrategyBuilder.sol) | Canonical bytecode builders for the 0xf0 auction and 0xf1 backstop |
| [`contracts/oracles/OperatorPriceFeed.sol`](contracts/oracles/OperatorPriceFeed.sol) | AggregatorV3 feed for local stress tests (production uses Chainlink) |
| [`test/AquaPrime.test.ts`](test/AquaPrime.test.ts) | 18 end-to-end tests with real token transfers |
| [`test/AquaPrime.edge.test.ts`](test/AquaPrime.edge.test.ts) | 20 edge cases + a 40-position property test of the surgical math |
| [`test/Lifecycle.test.ts`](test/Lifecycle.test.ts) | Full lifecycle integration with token-conservation and custody checks |
| [`frontend/test`](frontend/test) | Vitest: risk-math parity with the contract, SwapVM dissector, approval state machine, rate limiter |
| [`frontend/e2e/lifecycle-ui.cjs`](frontend/e2e/lifecycle-ui.cjs) | Playwright: the whole story through the real UI |
| [`scripts/e2e-agentpass.mjs`](scripts/e2e-agentpass.mjs) | Agent Pass approve/deny E2E against the running backend |
| [`agent/keeper.ts`](agent/keeper.ts) | Deterministic keeper loop |
| [`frontend/`](frontend) | Next.js 14 terminal: SLAC, bytecode/register dissector, borrower + keeper console |

Official contracts used: `Aqua.sol` (unmodified, from `@1inch/aqua`), the `SwapVM` engine and stock instructions
(unmodified, from `@1inch/swap-vm`). Only the router's dispatch table is ours.

---

## Live on Sepolia

All five AquaPrime contracts are source-verified on [Sourcify](https://repo.sourcify.dev/11155111/). They run against 1inch's **official canonical Aqua**.

| Contract | Address |
|---|---|
| Aqua (official, canonical) | [`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`](https://sepolia.etherscan.io/address/0x1111113ccf1426a8e30e2bff5e005d929bf6a90a) |
| AquaPrimeRouter (0xf0/0xf1) | [`0xbBae5064B9ff7619F63a9F48a68DD488EF41beF0`](https://sepolia.etherscan.io/address/0xbBae5064B9ff7619F63a9F48a68DD488EF41beF0) |
| CreditPositionRegistry | [`0x5274de7873D7381Ff55b6DFd81De2550dd92dE41`](https://sepolia.etherscan.io/address/0x5274de7873D7381Ff55b6DFd81De2550dd92dE41) |
| LiquidationExecutor | [`0x96a953570Df445ec0f9404eb5505066fB09b14f1`](https://sepolia.etherscan.io/address/0x96a953570Df445ec0f9404eb5505066fB09b14f1) |
| StrategyBuilder | [`0xA4e413911C2dFBD0f08E1A3C7B9C372bB0867305`](https://sepolia.etherscan.io/address/0xA4e413911C2dFBD0f08E1A3C7B9C372bB0867305) |
| AquaAMM | [`0xfF720b3E996D5991101bd93A096b1C31C1b1BAD8`](https://sepolia.etherscan.io/address/0xfF720b3E996D5991101bd93A096b1C31C1b1BAD8) |
| Price feed | Chainlink ETH/USD `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| Tokens | Circle USDC `0x1c7D…7238`, WETH `0xfFf9…6B14` |

The maker `0x866E…6814` ships 3 strategies from one wallet (3.0x SLAC). Loans are `aqua.pull()`ed straight
from that wallet; the registry holds 0 USDC. Browser reads go through Anon-RPC on the **Nox mixnet**
(verified in Chrome: "Private Read Mode: ON").

### Hosted demo market (Sepolia)

Next to the canonical market above, a **clearly labelled demo market** lets judges run the whole lifecycle on Sepolia
with no wallet: its price feed is an `OperatorPriceFeed` (owned by the keeper) instead of Chainlink, so ETH can be
"crashed" on demand. Everything else is real: the same canonical 1inch Aqua, Circle USDC and WETH, the same maker
wallet (its 15 USDC backs both markets at once). Agent Pass approvals on the hosted site come from a **hosted test
IdP labelled "NOT World"** until World allow-lists the app; the backend validates it exactly like auth.world.org.
All six contracts are Sourcify exact-match.

| Demo-market contract | Address |
|---|---|
| CreditPositionRegistry | [`0xbA67558c205EcDC84898c3b069d4F0280b10F100`](https://sepolia.etherscan.io/address/0xbA67558c205EcDC84898c3b069d4F0280b10F100) |
| LiquidationExecutor | [`0x4E393F94cB0Af02f4c56B7d930C4f8464a5b6509`](https://sepolia.etherscan.io/address/0x4E393F94cB0Af02f4c56B7d930C4f8464a5b6509) |
| AquaPrimeRouter | [`0x174e39FE19ce1d1c5D070208E3bA2Edc98C856BB`](https://sepolia.etherscan.io/address/0x174e39FE19ce1d1c5D070208E3bA2Edc98C856BB) |
| StrategyBuilder | [`0x08D4323adabded24e29F734e492BA765BeC1dD1b`](https://sepolia.etherscan.io/address/0x08D4323adabded24e29F734e492BA765BeC1dD1b) |
| AquaAMM | [`0xd3c1E9AA87a2b1F77035Dc28D7228014bbCedE9c`](https://sepolia.etherscan.io/address/0xd3c1E9AA87a2b1F77035Dc28D7228014bbCedE9c) |
| OperatorPriceFeed (demo only) | [`0x481Fe6851CB7573F40aF7D7cE8c13632bE3A4489`](https://sepolia.etherscan.io/address/0x481Fe6851CB7573F40aF7D7cE8c13632bE3A4489) |

Judge flow: open `/app` → **Start a live rescue** (the server resets a demo position to HF 1.11 at the real Chainlink
price, one tx per call) → crash ETH → ship the 0xf0 auction → try the denied path (HTTP 403) → approve on the test
IdP → one-transaction surgical rescue. One session at a time (10-minute lease), per-network and daily caps.
Run the hosted configuration locally with `npm run demo:sepolia`; deploy it with [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Run it

Requirements: Node 20+, a browser wallet (MetaMask etc.).

```bash
yarn            # or npm install
```

```bash
npm test                          # 43 contract tests: unit, edge, property, lifecycle
```
```bash
cd frontend && npm test           # 19 vitest unit tests
```
```bash
cd frontend && npm run test:e2e   # UI lifecycle in Chrome (needs npm run demo:local running)
```

Local chain (terminal 1):

```bash
npm run node
```

Deploy, export ABIs, seed the maker's 3 strategies (terminal 2):

```bash
npm run deploy:localhost && npm run seed:localhost
```

Optional demo borrower (hardhat account #2, anonymous tier):

```bash
npx hardhat run scripts/demo-borrower.ts --network localhost
```

Frontend (terminal 3):

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

Keeper agent (terminal 4):

```bash
npm run keeper
```

For local runs, import hardhat account #2 or #3 into your wallet (they hold demo WETH). Hardhat account #0 is the
deployer, keeper, attester and oracle operator, so put its well-known test key into `frontend/.env.local`.

### One-command local demo
```bash
npm run demo:local
```
This boots a hardhat chain, deploys and seeds AquaPrime, opens a borrower (HF 1.11), and starts the Agent Pass test IdP
and the web app on http://localhost:3000. Agent Pass approvals in this mode come from the local test IdP, and the
keeper console labels them **"Local test IdP (NOT World)"**. Export `WORLD_AUTH_ISSUER/CLIENT_ID/CLIENT_SECRET` to use World.

### Demo script (~3 min)
1. **Panel 1:** the gauge shows 3.0x SLAC. The wallet balance doesn't change while three strategies are live. Click **Dock** to retire one: still zero transfers.
2. **Panel 3:** deposit 10 WETH and borrow. The console shows USDC moving LP wallet -> borrower via `aqua.pull`.
3. **Verify with World IDKit** (simulator) -> the tier flips to 115% and you can borrow more. Cancelling in World leaves the tier unchanged.
4. Drag the oracle to $1,900 -> HF turns red. The keeper agent ships the `0xf0` auction and pauses.
5. **Panel 2:** the bytecode tab shows `f0 28 ...` as a custom instruction. The register table shows `balanceOut` capped from all collateral down to the surgical slice, live from `router.quote()`.
6. **Test Denied / Cancelled Path** -> HTTP 403, *Action Blocked*, no transaction.
7. **Approve Keeper via Agent Pass** -> World approval -> one transaction: auction fill + backstop `aqua.pull/push` + lender repaid. HF lands at exactly 1.02, with ~15% to 35% of collateral sold instead of 50% to 100%.

### Sepolia
1. `cp .env.example .env` and fill `PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY`, `KEEPER_PRIVATE_KEY`, `MAKER_PRIVATE_KEY`
   (maker needs Sepolia USDC from faucet.circle.com, some WETH and gas).
2. Check balances, feed freshness and roles before spending gas:
```bash
npm run preflight:sepolia
```
3. Deploy (real WETH, Circle USDC, Chainlink ETH/USD), verify, seed the maker's 3 strategies:
```bash
npm run deploy:sepolia && npm run verify:sepolia && npm run seed:sepolia
```
4. In `frontend/.env.local` set `NEXT_PUBLIC_CHAIN_ID=11155111` and a public `NEXT_PUBLIC_RPC_URL`. The deployment
   manifest is picked up automatically, and every browser read now goes through Anon-RPC. `ORACLE_MODE=operator` deploys a
   stress-test feed instead of Chainlink if you need to demo a crash on Sepolia.

---

## Production deployment

Single-node Docker deployment (web/API + keeper agent):

```bash
cp frontend/.env.example frontend/.env.production   # fill World + keeper secrets
```
```bash
docker compose up -d --build
```
```bash
curl -s localhost:3000/api/health
```

* `/api/health` is a readiness probe: chain, oracle freshness, attester ↔ registry match, keeper gas + operator
  rights, seeded strategies, and which integrations are configured. It never returns secrets.
* Gas-spending and World-facing endpoints are rate-limited per client (set `TRUST_PROXY=true` behind your reverse proxy).
* The Agent Pass approval store lives on the `approvals` volume, so approvals survive restarts. Move it to Postgres/Redis before
  running more than one web instance.
* The keeper agent scans `Borrowed` logs from the deployment block in 5k-block chunks (works on public RPCs).
* The images run as non-root and contain no secrets. `NEXT_PUBLIC_*` values are inlined at build time.

## World ID integration

**Trust events and credential choice.**
* *IDKit / Proof of Human.* The trust event is **under-collateralised credit issuance (115% vs 150%) and a 3-minute
  liquidation grace window**. Proof of Human is the minimum sufficient credential: it stops one borrower from spinning up
  50 Sybil wallets to farm the low-collateral tier, without collecting any government identity. Passport/NFC
  would add no protection for this event and would collect more data.
* *Agent Pass.* The trust event is **an autonomous agent spending a hot key to liquidate someone's collateral**. The
  agent may observe and prepare, but a fresh human authentication (`max_age=0`, essential `acr` in
  orb/selfie classes) must approve each fill.

**Server-side validation (no client trust).**
* IDKit: RP signature generated server-side (`/api/world/rp-context`). The proof's `signal_hash` must equal
  `hashSignal(wallet)`. The proof goes to `POST developer.world.org/api/v4/verify/{rp_id}`, and `environment` must match. The nullifier is then
  bound on-chain (`walletOfNullifier`) via an EIP-712 attestation.
* Agent Pass: discovery issuer check, PKCE S256, `state`, `iss` callback parameter, single-use code, RS256 JWKS
  verification (iss, aud, exp), `nonce`, `auth_time` ≥ attempt start, `acr` allow-list (fail-closed default),
  `(iss, sub)` operator binding, approvals bound to *(borrower, registry, executor, chainId)* with a 120 s TTL and
  consumed atomically before broadcast.

**Agent Pass status.** The integration targets `https://auth.world.org` (production) or `https://sandbox.auth.world.org`.
Both portals currently gate client registration to allow-listed enterprise Google accounts (`account_not_eligible`).
Until our account is allow-listed, the full OIDC step-up path is exercised end to end against a
standards-conformant local IdP (`scripts/e2e-agentpass.mjs`), using the same backend code unchanged. Switching to World is
`WORLD_AUTH_ISSUER` + `WORLD_AUTH_CLIENT_ID` + `WORLD_AUTH_CLIENT_SECRET`.

**Both paths, demonstrated.** Successful: verify → tier upgrade, approve → SwapVM fill. Unsuccessful: IDKit
cancel/rejection (tier unchanged); Agent Pass cancelled / abandoned / stale / wrong class / different human /
replayed → **HTTP 403, no transaction** (`node scripts/e2e-agentpass.mjs run <borrower>` prints all 8 cases).

### Integration debrief
* **Time to first success:** _fill in from your run (portal sign-up → first verified proof / first approved token)_.
* **Live result (Sepolia):** a simulator Proof of Human (World ID 4.0, signal = wallet) was verified by the Developer
  Portal and attested on-chain, so the wallet is now on the 115% tier. Tx
  [`0x3c42…8a9a`](https://sepolia.etherscan.io/tx/0x3c42ea308730461227ac66669ea0cb959683811867931f4d8b2450a525318a9a).
* **Friction we hit:** sending a *staging* (simulator) proof to `staging-developer.worldcoin.org` returns
  `app_not_migrated` for an app created on developer.world.org. The fix is to always call `developer.world.org` and let the
  body's `environment` field select staging. the Agent Pass guides describe the flow by RFC and don't list concrete endpoints (we had to read
  them from discovery). The accepted `acr` values had to be assembled from the step-up guide. The IDKit verify docs don't
  spell out that apps must check `signal_hash` themselves to bind a proof to a wallet. The sandbox needs
  a TestFlight invite plus about an hour of credential issuance.
* **Missing capability:** a first-party "transaction approval" claim (bind an ID token to a hash of the exact action),
  so RPs don't have to build attempt stores to bind approvals to actions.
* **Top improvement:** a copy-paste server reference (Node) for step-up with `max_age=0`, plus a published sandbox acr
  list and test fixtures for the denied paths.

---

## CROPS

* **C: Censorship resistance / control.** Every protocol action except borrowing is permissionless: anyone can
  `startAuction`, fill the `0xf0` order directly, `closeAuction`, or repay. Pausing only stops *new* borrows, never repayment or
  liquidation. LPs can `aqua.dock` at any time. If the AquaPrime backend disappears, positions stay fully operable on-chain.
  If the oracle goes stale, liquidations halt (`StalePrice`) rather than run on bad data.
* **O: Open source.** AquaPrime's own code is MIT (see `LICENSE`) and builds with `npm test` / `npm run build`.
  It depends on 1inch Aqua/SwapVM, which are published source-available under Degensoft licenses (`LICENSES/`), and
  template-derived files keep that header.
* **P: Privacy.** All browser JSON-RPC reads (balances, health, `liquidationQuote`, `router.quote`) go through EF
  **Anon-RPC** (hash-pinned worker in a null-origin iframe), fail-closed with an explicit opt-out. The only intentional
  exclusion is a `localhost` RPC (an anonymity network can't reach it), and the badge says so. No trackers or analytics; fonts are
  self-hosted at build time; `Referrer-Policy: no-referrer`. World ID shares only a nullifier, never identity data.
  Third parties learn: World learns that an RP verified, and the RPC learns nothing linkable to you.
* **S: Security.** Keys stay in the user's wallet. Server keys (attester, keeper, RP signing, OIDC client) are
  server-only env vars and never reach the client bundle. The keeper's on-chain power is limited to filling surgical slices
  (`0xf0` caps every fill), and the executor is operator-allow-listed. Approvals are single-use, short-lived and
  action-bound. **Not audited. Hackathon code.**

---

## Security notes & limitations
* Collateral is escrowed in the registry. *Lender* capital is zero-custody; borrower collateral can't be (credit needs enforceability).
* `OperatorPriceFeed` exists only for local/stress demos. Production deployments use Chainlink with a staleness bound.
* The keeper backend's approval store is a single-node JSON file. Use Postgres/Redis for multi-instance deployments.
* World credentials (IDKit `app_id`/`rp_id`/signing key, Agent Pass client) must be created in the World portals and
  are not included.

## License
AquaPrime original code: MIT. Template-derived files and the 1inch dependencies keep their own licenses: see
`LICENSES/` and `THIRD_PARTY_NOTICES`.

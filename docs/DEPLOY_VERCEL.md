# Hosting the judge demo on Vercel (Sepolia)

The hosted site runs the **labelled Sepolia demo market** so anyone can run the full lifecycle — crash ETH, ship the
0xf0 auction, see the denied path, approve on the (labelled) test IdP and watch the surgical rescue land on Sepolia
Etherscan — with no wallet and no gas. The canonical Chainlink market stays untouched and documented in the README.

Run the exact hosted configuration locally first: `npm run demo:sepolia` (port 3005), then
`cd frontend && BASE=http://localhost:3005 npm run test:e2e:sepolia`.

## 1. Before anything: rotate the exposed keys

The attester key, keeper key and World RP signing key were pasted into a third-party report. Rotate them before they
go into Vercel's env:

| Key | How to rotate (owner = deployer) |
|---|---|
| Attester | new key → `registry.setHumanAttester(newAddr)` on **both** registries (`0x5274…dE41` canonical, `0xbA67…F100` demo) |
| Keeper | new key → `executor.setOperator(newAddr, true)` + `setOperator(old, false)` on both executors; demo feed: `OperatorPriceFeed.transferOwnership(newAddr)` (current owner = old keeper) |
| World RP signing key | Developer Portal / `rotate_world_id_signing_key`, then update `WORLD_RP_SIGNING_KEY` |

## 2. Import the project

1. vercel.com → **Add New → Project** → import `rythmern02/treaz`.
2. **Root Directory: `frontend`**. Framework preset: Next.js (from `frontend/vercel.json`, which also gives every API
   route a 60 s limit — keeper/oracle routes wait for a Sepolia confirmation).
3. Do **not** set `NEXT_DIST_DIR` (it is only for running a dev server beside a local build).

## 3. Shared state: Upstash Redis

Vercel functions don't share memory or disk, so approvals, rate limits, the demo lease and the test IdP's used codes
live in Redis. In the project: **Storage / Marketplace → Upstash for Redis → Create & connect**. It injects
`KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `_TOKEN`) — the store picks either up
automatically and switches to its compare-and-set backend.

## 4. Environment variables (Production)

Values in *italics* come from the gitignored root `.env` (or the rotated keys).

| Name | Value |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` |
| `NEXT_PUBLIC_MARKET` | `demo` |
| `NEXT_PUBLIC_RPC_URL` / `RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` (fallbacks are built in) |
| `NEXT_PUBLIC_ANON_SPECIFIER_ADDRESS` | `0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A` (Nox worker specifier) |
| `ATTESTER_PRIVATE_KEY` | *attester key* |
| `KEEPER_PRIVATE_KEY` | *keeper key* |
| `ORACLE_OPERATOR_PRIVATE_KEY` | *same keeper key* (the demo feed is owned by the keeper) |
| `ENABLE_OPERATOR_ORACLE` | `true` |
| `KEEPER_API_TOKEN` | any random string |
| `DEMO_BORROWER_PRIVATE_KEY` | *`DEMO_BORROWER_PRIVATE_KEY` from `.env`* |
| `DEMO_DAILY_CAP` / `DEMO_PER_CLIENT_CAP` | optional, default `40` / `6` sessions per day |
| `TEST_IDP_ENABLED` | `true` |
| `TEST_IDP_PRIVATE_JWK` | *`TEST_IDP_PRIVATE_JWK` from `.env`*, or a fresh one from `node scripts/gen-test-idp-key.mjs` |
| `WORLD_AUTH_ISSUER` | `https://<your-domain>/api/test-idp` |
| `WORLD_AUTH_CLIENT_ID` | `aquaprime-demo` |
| `WORLD_AUTH_CLIENT_SECRET` | *`TEST_IDP_CLIENT_SECRET` from `.env`* |
| `WORLD_AUTH_REDIRECT_URI` | `https://<your-domain>/api/agentpass/callback` |
| `NEXT_PUBLIC_WORLD_APP_ID` | `app_4fb55336d3f32392ff33a926db827c63` |
| `NEXT_PUBLIC_WORLD_ACTION` | `aquaprime-human-prime-tier` |
| `NEXT_PUBLIC_WORLD_ENVIRONMENT` | `staging` |
| `WORLD_RP_ID` | `rp_4b4891f208252b64` |
| `WORLD_RP_SIGNING_KEY` | *(rotated) World RP signing key* |

`<your-domain>` must be the final HTTPS domain (custom domain or `*.vercel.app`) — the test IdP's issuer and the
OAuth redirect are checked exactly. Anon-RPC needs HTTPS, which Vercel provides.

## 5. Funding

Sepolia gas is cheap (txs pay a pinned 0.05 gwei tip). Each judge session is ~8 small transactions and sells a
slice of the 0.002 WETH collateral to the LP backstop, so the demo borrower loses ≈ 0.0005 ETH per session.

| Wallet | Pays for | Keep above |
|---|---|---|
| Demo borrower `0x0599…48bb` | reset txs + collateral | 0.005 ETH (`/api/demo/session` reports `demo_unfunded` below 0.0003) |
| Keeper `0x68A5…C8b2` | oracle, auction, liquidation | 0.01 ETH |
| Maker `0x866E…6814` | nothing (approvals only) | 15 USDC is enough; liquidity recycles through `aqua.push` |

`GET /api/health` shows keeper gas, oracle freshness and whether everything is configured.

## 6. Switching to real World Agent Pass

Once World allow-lists the app, register the client with redirect URI `https://<your-domain>/api/agentpass/callback`
and change only: `WORLD_AUTH_ISSUER=https://auth.world.org`, `WORLD_AUTH_CLIENT_ID`, `WORLD_AUTH_CLIENT_SECRET`
(or `WORLD_AUTH_PRIVATE_KEY_JWK`), and set `TEST_IDP_ENABLED=false`. No code changes; the UI label switches from
"Hosted test IdP — NOT World" to "World ID Agent Pass" automatically.

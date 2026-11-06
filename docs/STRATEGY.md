# AquaPrime — use cases, agentic roadmap, and how we win

## What judges should feel in 3 minutes
1. **"The money never moved."** The SLAC gauge shows 3× quoting power and `$0` locked. Docking a strategy moves zero tokens.
2. **"It only took what it had to."** The crash simulator and the live rescue show 13–30% of collateral sold instead of 50–100%,
   enforced by bytecode (opcode `0xf0`), not by a keeper's goodwill.
3. **"An agent asked a human first."** Denied → HTTP 403 with no transaction. Approved → one transaction that fills the auction,
   routes collateral into an LP's backstop, and repays the lender through Aqua.

## Prize-by-prize scorecard
| Track | What they score | Our evidence |
|---|---|---|
| 1inch · Aqua app (SwapVM scored higher) | official Aqua/SwapVM, custom opcodes, on-chain transfers, commit history | canonical Aqua on Sepolia; redeployed SwapVM with **two** custom opcodes (`0xf0`, `0xf1`); 43 contract tests incl. a property test; live `aqua.pull/push` |
| World · IDKit | real credential, server/on-chain verification, trust rationale, alternate path | live World ID 4.0 proof → Developer Portal verify → on-chain nullifier binding; cancel path leaves the tier unchanged |
| World · Agent Pass | full journey + failed path, backend validation, debrief | full OIDC step-up implemented and tested end to end (8 cases); **blocked on portal allow-listing** — get this unblocked at the booth |
| EF · Anon-RPC | reads routed by default, demo, UX, technical depth | every browser read through Nox mixnet, fail-closed, verified in Chrome; explicit exclusion only for localhost |

## Agentic use cases (ranked by demo impact × buildability)
1. **Health Guardian (borrower-side agent)** — *highest leverage for Agent Pass.* The user's own agent watches HF and,
   before a liquidation, proposes a self-rescue: repay from the user's Aqua credit-line earnings, or top up collateral.
   The protected action spends the *user's* funds, so the fresh World ID check is meaningful for the user, not just the operator.
   It reuses `/api/agentpass/*` and the keeper loop.
2. **Sybil-resistant keeper network.** Executor operators must be World-ID-bound humans (one operator per human). The Dutch
   auction makes them compete on price, so there's no single trusted liquidator and no Sybil keeper swarm.
3. **SLAC auto-allocator (LP agent).** It reallocates an LP's virtual liquidity between credit line, backstop and AMM by utilisation,
   using `aqua.dock` + `aqua.ship`. Capital efficiency goes up without a single token transfer.
4. **Human credit score.** One nullifier means one credit history. On-time repayment steps the tier down (115% → 110%), and a liquidation steps it up.
   Credit that follows the person, not the wallet, without KYC.
5. **Flash-refinance from legacy lenders.** One transaction moves an Aave position near liquidation into AquaPrime's surgical engine.
6. **Institutional backstop desks.** Market makers post `0xf1` bids from MPC wallets: liquidation flow without depositing into a pool.

## Business model (recap)
Reserve factor (10% of interest) + liquidation protocol fee (0.5% of seized collateral) to the treasury. In the full
lifecycle test on 34k of loans over 30 days with one crash: maker +$339, treasury +$91, keeper +$72. Borrowers lost
2.0 / 10 WETH instead of ≈ 4.6 under a close-factor liquidation.

## Next 24 hours (priority order)
1. Get Agent Pass allow-listed and swap the issuer (zero code change), then record the real approve/deny flow.
2. Build the Health Guardian (use case 1) on top of the existing approval pipeline.
3. Record the ≤3-minute demo video (CROPS requirement) using `npm run demo:local` + the Sepolia landing page.
4. Keep committing tomorrow: 1inch rejects single-day histories.

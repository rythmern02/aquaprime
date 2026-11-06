# Builder feedback — 1inch Aqua & SwapVM

What worked well
* **Aqua's model is a genuinely new primitive for credit.** `pull` / `push` against virtual balances let a lending app
  draw LP capital just-in-time, and `rawBalances(...).tokensCount == 0xff` makes "docked" detectable on-chain.
* **The `_dispatch` override is the right extension point.** A custom opcode is a ~60-line library. Wrapping the
  rest of the program with `ctx.runLoop()` (the pattern `Fee` uses) lets an instruction enforce invariants *after* the
  curve runs. That's how `0xf0` guarantees the surgical cap.
* **Maker hooks plus taker callbacks compose.** Nested `swap()` calls on different order hashes inside a pre-transfer-in
  callback enabled a zero-capital flash liquidation across two strategies.

Friction
1. **Router size.** `SwapVMRouter` with the full `Opcodes` table is ~33.8 KB, which can't deploy on mainnet. Adding
   anything to `AquaSwapVMRouter` (24.28 KB) also pushes it over EIP-170. We had to hand-build an
   AquaOpcodes-compatible table. A documented "compose your own table" helper, or external instruction libraries,
   would help.
2. **Two opcode numberings.** `Opcodes` and `AquaOpcodes` assign different indices to the same instruction (e.g. salt
   0x22 vs 0x14), so bytecode isn't portable across routers. A shared registry (or self-describing programs) would
   prevent subtle bugs. We hit this once.
3. **`LimitSwap` doesn't bound `amountOut ≤ balanceOut`.** For Aqua orders, over-asks fall through to `aqua.pull`
   underflow. That's safe, but the revert is opaque. We enforce the bound in our guard.
4. **Static programs vs time-based auctions.** `DutchAuction` needs a start time baked into bytecode, but
   liquidation start times are only known on-chain. A variant that reads the start time from a register or maker hook
   would make it reusable for liquidations.
5. **`isFirstTransferFromTaker` reorders hooks.** Apps that clean up state in `postTransferIn` (e.g. `aqua.dock`) must
   remember the pull may still be pending. Worth a doc note.
6. **TS helpers live in tests.** `TakerTraitsLib` / `MakerTraitsLib` builders are copied around. Publishing them in
   the Aqua SDK would remove a common source of encoding bugs.

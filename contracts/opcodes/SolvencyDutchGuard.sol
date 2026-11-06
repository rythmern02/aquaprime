// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context, ContextLib } from "@1inch/swap-vm/src/libs/VM.sol";
import { ICreditRegistry } from "../interfaces/ICreditRegistry.sol";

/// @title SolvencyDutchGuard — custom SwapVM opcode 0xf0
/// @notice Wrapping instruction that turns a CreditPositionRegistry collateral strategy into a
///         surgical, solvency-aware Dutch auction:
///           1. reverts unless the borrower is actually insolvent (HF < 1.0)
///           2. reverts while a World ID verified human is inside the grace window
///           3. overwrites the swap registers with the *exact* debt slice / collateral slice that
///              restores HF to the registry target (1.05), priced at the live Dutch-auction discount
///           4. runs the rest of the program (the pricing curve, e.g. LimitSwap) under that cap
///           5. re-checks after the curve that the taker could not seize more than the cap
/// @dev Program layout: [0xf0 SolvencyDutchGuard] -> [LimitSwap1D] -> [Salt]
///      Args layout: registry (20 bytes) | borrower (20 bytes)
library SolvencyDutchGuard {
    using ContextLib for Context;

    uint8 internal constant OPCODE = 0xf0;
    uint256 internal constant ARGS_LENGTH = 40;

    error SolvencyGuardBadArgs(uint256 length);
    error SolvencyGuardMakerMismatch(address maker, address registry);
    error SolvencyGuardDirectionMismatch(address tokenIn, address tokenOut);
    error SolvencyGuardMustRunBeforeCurve(uint256 amountIn, uint256 amountOut);
    error NoActiveAuction(address borrower);
    error PositionHealthy(uint256 currentHealthFactor);
    error HumanGracePeriodActive(uint256 auctionStart);
    error NothingToLiquidate(address borrower);
    error SurgicalCapExceeded(uint256 amountIn, uint256 capIn, uint256 amountOut, uint256 capOut);

    /// @notice Encodes a full instruction: opcode | argsLength | registry | borrower
    function build(address registry, address borrower) internal pure returns (bytes memory) {
        return abi.encodePacked(OPCODE, uint8(ARGS_LENGTH), registry, borrower);
    }

    function parse(bytes calldata args) internal pure returns (address registry, address borrower) {
        require(args.length == ARGS_LENGTH, SolvencyGuardBadArgs(args.length));
        registry = address(bytes20(args[0:20]));
        borrower = address(bytes20(args[20:40]));
    }

    function exec(Context memory ctx, bytes calldata args) internal {
        (address registry, address borrower) = parse(args);

        // Only the registry's own shipped strategies can be governed by this guard.
        require(ctx.query.maker == registry, SolvencyGuardMakerMismatch(ctx.query.maker, registry));
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            SolvencyGuardMustRunBeforeCurve(ctx.swap.amountIn, ctx.swap.amountOut)
        );

        ICreditRegistry reg = ICreditRegistry(registry);
        require(
            ctx.query.tokenIn == reg.DEBT_TOKEN() && ctx.query.tokenOut == reg.COLLATERAL_TOKEN(),
            SolvencyGuardDirectionMismatch(ctx.query.tokenIn, ctx.query.tokenOut)
        );

        ICreditRegistry.LiquidationQuote memory q = reg.liquidationQuote(borrower);
        if (!q.auctionActive) revert NoActiveAuction(borrower);
        // 1. Invariant: healthy positions (HF >= 1.0) can never be liquidated
        if (q.healthFactor >= 1e18) revert PositionHealthy(q.healthFactor);
        // 2. World ID human perk: grace window before the auction opens
        if (block.timestamp < q.auctionStart) revert HumanGracePeriodActive(q.auctionStart);

        // 3. Surgical cap — never more than the slice that restores solvency, and never more than
        //    what is still allocated to this strategy inside Aqua (ctx.swap.balanceOut).
        uint256 capOut = q.collateralOut;
        uint256 capIn = q.debtToCover;
        if (ctx.swap.balanceOut < capOut) {
            capIn = capIn * ctx.swap.balanceOut / capOut;
            capOut = ctx.swap.balanceOut;
        }
        require(capIn > 0 && capOut > 0, NothingToLiquidate(borrower));

        ctx.swap.balanceIn = capIn;
        ctx.swap.balanceOut = capOut;

        // 4. Execute the pricing curve under the cap
        ctx.runLoop();

        // 5. Post-curve enforcement — the curve may not hand out more than the surgical slice
        require(
            ctx.swap.amountIn <= capIn && ctx.swap.amountOut <= capOut,
            SurgicalCapExceeded(ctx.swap.amountIn, capIn, ctx.swap.amountOut, capOut)
        );
    }
}

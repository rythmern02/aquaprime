// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Context, ContextLib } from "@1inch/swap-vm/src/libs/VM.sol";
import { IPriceFeed } from "../interfaces/IPriceFeed.sol";

/// @title OracleBackstopBid — custom SwapVM opcode 0xf1
/// @notice Lets an Aqua maker post a one-sided *bid* for a base asset (e.g. WETH) out of the quote
///         asset sitting in their own wallet (e.g. USDC), priced at a Chainlink-style oracle minus a
///         maker-chosen discount. Used as the zero-custody "liquidation backstop": liquidations are
///         absorbed by LP wallets instead of by a custodial pool.
/// @dev Program layout: [Whitelist executor] -> [0xf1 OracleBackstopBid] -> [LimitSwap1D] -> [Salt]
///      Args: feed (20) | baseToken (20) | discountBps (2) | maxStaleness (4)
library OracleBackstopBid {
    using ContextLib for Context;

    uint8 internal constant OPCODE = 0xf1;
    uint256 internal constant ARGS_LENGTH = 46;
    uint256 internal constant BPS = 10_000;

    error BackstopBadArgs(uint256 length);
    error BackstopOnlyBuysBase(address tokenIn, address baseToken);
    error BackstopMustRunBeforeCurve(uint256 amountIn, uint256 amountOut);
    error BackstopStalePrice(uint256 updatedAt, uint256 maxStaleness);
    error BackstopInvalidPrice(int256 answer);
    error BackstopEmpty();
    error BackstopCapExceeded(uint256 amountOut, uint256 capOut);

    function build(address feed, address baseToken, uint16 discountBps, uint32 maxStaleness)
        internal pure returns (bytes memory)
    {
        return abi.encodePacked(OPCODE, uint8(ARGS_LENGTH), feed, baseToken, discountBps, maxStaleness);
    }

    function parse(bytes calldata args)
        internal pure returns (address feed, address baseToken, uint256 discountBps, uint256 maxStaleness)
    {
        require(args.length == ARGS_LENGTH, BackstopBadArgs(args.length));
        feed = address(bytes20(args[0:20]));
        baseToken = address(bytes20(args[20:40]));
        discountBps = uint16(bytes2(args[40:42]));
        maxStaleness = uint32(bytes4(args[42:46]));
    }

    /// @notice Price (quote units per 1 whole base unit) the maker bids, in quote-token decimals.
    function bidPrice(address feed, uint256 discountBps, uint256 maxStaleness, uint8 quoteDecimals)
        internal view returns (uint256)
    {
        (, int256 answer,, uint256 updatedAt,) = IPriceFeed(feed).latestRoundData();
        require(answer > 0, BackstopInvalidPrice(answer));
        require(maxStaleness == 0 || block.timestamp <= updatedAt + maxStaleness, BackstopStalePrice(updatedAt, maxStaleness));
        uint8 feedDecimals = IPriceFeed(feed).decimals();
        uint256 p = uint256(answer) * (10 ** quoteDecimals) / (10 ** feedDecimals);
        return p * (BPS - discountBps) / BPS;
    }

    function exec(Context memory ctx, bytes calldata args) internal {
        (address feed, address baseToken, uint256 discountBps, uint256 maxStaleness) = parse(args);
        require(ctx.query.tokenIn == baseToken, BackstopOnlyBuysBase(ctx.query.tokenIn, baseToken));
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            BackstopMustRunBeforeCurve(ctx.swap.amountIn, ctx.swap.amountOut)
        );

        uint256 capOut = ctx.swap.balanceOut; // quote token still allocated in Aqua
        require(capOut > 0, BackstopEmpty());

        uint8 baseDecimals = IERC20Metadata(baseToken).decimals();
        uint8 quoteDecimals = IERC20Metadata(ctx.query.tokenOut).decimals();
        uint256 price = bidPrice(feed, discountBps, maxStaleness, quoteDecimals);

        // balanceIn = how much base the whole quote allocation buys at the bid price
        ctx.swap.balanceIn = capOut * (10 ** baseDecimals) / price;
        ctx.swap.balanceOut = capOut;

        ctx.runLoop();

        require(ctx.swap.amountOut <= capOut, BackstopCapExceeded(ctx.swap.amountOut, capOut));
    }
}

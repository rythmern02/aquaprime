// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { OracleBackstopBid } from "./opcodes/OracleBackstopBid.sol";
import { SolvencyDutchGuard } from "./opcodes/SolvencyDutchGuard.sol";

/// @title StrategyBuilder
/// @notice Canonical, on-chain builder for AquaPrime LP strategies so UIs/keepers never hand-roll bytecode.
contract StrategyBuilder {
    uint8 internal constant OP_WHITELIST_SINGLE_TAKER = 47; // Opcodes._whitelistSingleTaker
    uint8 internal constant OP_LIMIT_SWAP_1D = 25;          // Opcodes._limitSwap1D
    uint8 internal constant OP_SALT = 20;                   // AquaOpcodes._salt (0x14)

    /// @notice Registry-owned surgical liquidation auction for one borrower.
    /// @dev Program: [0xf0 SolvencyDutchGuard(registry, borrower)] [0x19 LimitSwap1D] [0x22 salt(nonce)]
    ///      postTransferIn hook → registry (makerData = abi.encode(borrower)).
    function buildAuctionOrder(
        address registry,
        address collateralToken,
        address debtToken,
        address borrower,
        uint64 nonce
    ) public pure returns (ISwapVM.Order memory) {
        (address tokenA, address tokenB) = collateralToken < debtToken
            ? (collateralToken, debtToken)
            : (debtToken, collateralToken);
        bytes memory program = bytes.concat(
            SolvencyDutchGuard.build(registry, borrower),
            abi.encodePacked(OP_LIMIT_SWAP_1D, uint8(1), debtToken < collateralToken), // taker: debt -> collateral
            abi.encodePacked(OP_SALT, uint8(8), nonce)
        );
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: registry,
            receiver: address(0),
            tokenA: tokenA,
            tokenB: tokenB,
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            hasPreTransferInHook: false,
            hasPostTransferInHook: true,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: registry,
            postTransferInData: abi.encode(borrower),
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));
    }

    /// @notice LP "Liquidation Backstop": a one-sided oracle bid that buys `baseToken` (WETH) with
    ///         `quoteToken` (USDC) straight out of the LP wallet, fillable only by the LiquidationExecutor.
    /// @dev Program: [0x2f whitelist executor] [0xf1 OracleBackstopBid] [0x19 LimitSwap1D] [0x22 salt]
    function buildBackstopOrder(
        address maker,
        address executor,
        address feed,
        address baseToken,
        address quoteToken,
        uint16 discountBps,
        uint32 maxStaleness,
        uint64 salt
    ) external pure returns (ISwapVM.Order memory) {
        (address tokenA, address tokenB) = baseToken < quoteToken ? (baseToken, quoteToken) : (quoteToken, baseToken);
        bytes memory program = bytes.concat(
            abi.encodePacked(OP_WHITELIST_SINGLE_TAKER, uint8(10), uint80(uint160(executor))),
            OracleBackstopBid.build(feed, baseToken, discountBps, maxStaleness),
            abi.encodePacked(OP_LIMIT_SWAP_1D, uint8(1), baseToken < quoteToken), // taker: base -> quote
            abi.encodePacked(OP_SALT, uint8(8), salt)
        );
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
            receiver: address(0),
            tokenA: tokenA,
            tokenB: tokenB,
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            hasPreTransferInHook: false,
            hasPostTransferInHook: false,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));
    }
}

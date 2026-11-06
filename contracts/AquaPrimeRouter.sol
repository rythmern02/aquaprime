// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";
import { SwapVM } from "@1inch/swap-vm/src/SwapVM.sol";
import { Context } from "@1inch/swap-vm/src/libs/VM.sol";

import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { XYCConcentrate } from "@1inch/swap-vm/src/instructions/XYCConcentrate.sol";
import { Decay } from "@1inch/swap-vm/src/instructions/Decay.sol";
import { Fee } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { LimitSwap } from "@1inch/swap-vm/src/instructions/LimitSwap.sol";
import { Whitelist } from "@1inch/swap-vm/src/instructions/Whitelist.sol";

import { SolvencyDutchGuard } from "./opcodes/SolvencyDutchGuard.sol";
import { OracleBackstopBid } from "./opcodes/OracleBackstopBid.sol";

/// @title AquaPrimeRouter
/// @notice Redeployment of the official SwapVM engine with an AquaPrime instruction set.
///         Indices 10–30 mirror the stock `AquaOpcodes` table exactly (so AquaAMM programs run
///         unchanged); PeggedSwap/Extruction are omitted to stay under the EIP-170 size limit.
///         Additions:
///           0x19  LimitSwap._limitSwap1D            (stock instruction, same index as `Opcodes`)
///           0x2f  Whitelist._whitelistSingleTaker   (stock instruction, same index as `Opcodes`)
///           0xf0  SolvencyDutchGuard  — custom: surgical, solvency-capped Dutch liquidation auction
///           0xf1  OracleBackstopBid   — custom: oracle-priced one-sided LP bid (liquidation backstop)
contract AquaPrimeRouter is Simulator, SwapVM, Controls, XYCSwap, XYCConcentrate, Decay, Fee, LimitSwap, Whitelist {
    uint8 public constant OP_LIMIT_SWAP_1D = 0x19;
    uint8 public constant OP_WHITELIST_SINGLE_TAKER = 0x2f;
    uint8 public constant OP_SOLVENCY_DUTCH_GUARD = 0xf0;
    uint8 public constant OP_ORACLE_BACKSTOP_BID = 0xf1;

    error UnknownOpcode(uint256 opcode);

    constructor(address aqua, address weth, address owner)
        SwapVM(aqua, weth, owner, "AquaPrimeRouter", "1")
        Fee(aqua)
    {}

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if (opcode == OP_SOLVENCY_DUTCH_GUARD) SolvencyDutchGuard.exec(ctx, args);
        else if (opcode == OP_ORACLE_BACKSTOP_BID) OracleBackstopBid.exec(ctx, args);
        else if (opcode == OP_LIMIT_SWAP_1D) LimitSwap._limitSwap1D(ctx, args);
        else if (opcode == OP_WHITELIST_SINGLE_TAKER) Whitelist._whitelistSingleTaker(ctx, args);
        // ── stock AquaOpcodes indices ──
        else if (opcode == 10) Controls._jump(ctx, args);
        else if (opcode == 11) Controls._jumpIfTokenIn(ctx, args);
        else if (opcode == 12) Controls._jumpIfTokenOut(ctx, args);
        else if (opcode == 13) Controls._deadline(ctx, args);
        else if (opcode == 14) Controls._onlyTakerTokenBalanceNonZero(ctx, args);
        else if (opcode == 15) Controls._onlyTakerTokenBalanceGte(ctx, args);
        else if (opcode == 16) Controls._onlyTakerTokenSupplyShareGte(ctx, args);
        else if (opcode == 17) XYCSwap._xycSwapXD(ctx, args);
        else if (opcode == 18) XYCConcentrate._xycConcentrateGrowLiquidity2D(ctx, args);
        else if (opcode == 19) Decay._decayXD(ctx, args);
        else if (opcode == 20) Controls._salt(ctx, args);
        else if (opcode == 21) Fee._flatFeeAmountInXD(ctx, args);
        else if (opcode == 27) Fee._protocolFeeAmountInXD(ctx, args);
        else if (opcode == 28) Fee._aquaProtocolFeeAmountInXD(ctx, args);
        else revert UnknownOpcode(opcode);
    }
}

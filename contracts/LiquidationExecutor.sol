// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { ITakerCallbacks } from "@1inch/swap-vm/src/interfaces/ITakerCallbacks.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import { ICreditRegistry } from "./interfaces/ICreditRegistry.sol";

interface IAuctionSource is ICreditRegistry {
    function auctionOrder(address borrower) external view returns (ISwapVM.Order memory);
}

/// @title LiquidationExecutor
/// @notice Zero-capital surgical liquidations. In ONE transaction the keeper:
///   1. fills the borrower's 0xf0-guarded Dutch auction on AquaPrimeRouter (WETH slice → executor)
///   2. inside the SwapVM pre-transfer-in callback, sells that WETH into an LP's Aqua backstop
///      strategy (0xf1 OracleBackstopBid) — USDC is aqua.pull()ed from the LP wallet, WETH aqua.push()ed in
///   3. aqua.push()es the USDC owed into the registry strategy, which repays the lender via Aqua
///   4. forwards the spread (auction discount − backstop discount) to the keeper as profit
/// @dev Only allow-listed operators (the Agent-Pass gated keeper) can trigger it.
contract LiquidationExecutor is ITakerCallbacks, Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IAqua public immutable AQUA;
    ISwapVM public immutable ROUTER;
    IAuctionSource public immutable REGISTRY;
    address public immutable DEBT_TOKEN;
    address public immutable COLLATERAL_TOKEN;

    mapping(address => bool) public operators;

    // in-flight context (only set during liquidate)
    bool private _inFlight;
    bytes private _backstopOrder;

    event OperatorSet(address indexed operator, bool allowed);
    event Liquidated(
        address indexed borrower,
        address indexed operator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 backstopProceeds,
        uint256 profit
    );

    error NotOperator();
    error NotRouter();
    error NotInFlight();
    error BackstopShortfall(uint256 proceeds, uint256 owed);
    error InsufficientProfit(uint256 profit, uint256 minProfit);

    constructor(IAqua aqua, ISwapVM router, IAuctionSource registry, address owner_) Ownable(owner_) {
        AQUA = aqua;
        ROUTER = router;
        REGISTRY = registry;
        DEBT_TOKEN = registry.DEBT_TOKEN();
        COLLATERAL_TOKEN = registry.COLLATERAL_TOKEN();
        operators[owner_] = true;
        emit OperatorSet(owner_, true);
    }

    function setOperator(address op, bool allowed) external onlyOwner {
        operators[op] = allowed;
        emit OperatorSet(op, allowed);
    }

    /// @param borrower       Underwater position
    /// @param backstopOrder  LP backstop order (0xf1) that buys the seized collateral
    /// @param maxDebtIn      Upper bound on debt to repay (0 = full surgical slice)
    /// @param minProfit      Revert unless the keeper earns at least this much DEBT_TOKEN
    /// @param profitTo       Receiver of the spread
    function liquidate(
        address borrower,
        ISwapVM.Order calldata backstopOrder,
        uint256 maxDebtIn,
        uint256 minProfit,
        address profitTo
    ) external nonReentrant returns (uint256 debtRepaid, uint256 collateralSeized, uint256 profit) {
        require(operators[msg.sender], NotOperator());

        ICreditRegistry.LiquidationQuote memory q = REGISTRY.liquidationQuote(borrower);
        uint256 amount = maxDebtIn == 0 ? q.debtToCover : Math.min(q.debtToCover, maxDebtIn);
        ISwapVM.Order memory auction = REGISTRY.auctionOrder(borrower);

        uint256 balBefore = IERC20(DEBT_TOKEN).balanceOf(address(this));
        _inFlight = true;
        _backstopOrder = abi.encode(backstopOrder);

        (debtRepaid, collateralSeized,) = ROUTER.swap(auction, amount, TakerTraitsLib.build(_traits(
            DEBT_TOKEN < COLLATERAL_TOKEN, // isAToB when DEBT is tokenA
            true                           // pre-transfer-in callback
        )));

        _inFlight = false;
        delete _backstopOrder;

        profit = IERC20(DEBT_TOKEN).balanceOf(address(this)) - balBefore;
        require(profit >= minProfit, InsufficientProfit(profit, minProfit));
        if (profit > 0) IERC20(DEBT_TOKEN).safeTransfer(profitTo, profit);
        emit Liquidated(borrower, msg.sender, debtRepaid, collateralSeized, profit + debtRepaid, profit);
    }

    /// @inheritdoc ITakerCallbacks
    function preTransferInCallback(
        address maker,
        address /* taker */,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 orderHash,
        bytes calldata /* takerData */
    ) external override {
        require(msg.sender == address(ROUTER), NotRouter());
        require(_inFlight, NotInFlight());
        _inFlight = false; // single use: the nested backstop swap must not re-enter here

        // Sell the collateral slice we just received into the LP backstop (WETH -> USDC).
        ISwapVM.Order memory backstop = abi.decode(_backstopOrder, (ISwapVM.Order));
        IERC20(tokenOut).forceApprove(address(ROUTER), amountOut);
        (, uint256 proceeds,) = ROUTER.swap(backstop, amountOut, TakerTraitsLib.build(_backstopTraits(tokenOut < tokenIn)));
        require(proceeds >= amountIn, BackstopShortfall(proceeds, amountIn));

        // Pay the registry strategy through Aqua (USDC lands in the registry, credited to orderHash).
        IERC20(tokenIn).forceApprove(address(AQUA), amountIn);
        AQUA.push(maker, address(ROUTER), orderHash, tokenIn, amountIn);
    }

    function preTransferOutCallback(address, address, address, address, uint256, uint256, bytes32, bytes calldata)
        external pure override {}

    function _traits(bool isAToB, bool callback) private view returns (TakerTraitsLib.Args memory a) {
        a.taker = address(this);
        a.isExactIn = true;
        a.isAToB = isAToB;
        a.hasPreTransferInCallback = callback;
    }

    function _backstopTraits(bool isAToB) private view returns (TakerTraitsLib.Args memory a) {
        a.taker = address(this);
        a.isExactIn = true;
        a.isAToB = isAToB;
        a.useTransferFromAndAquaPush = true;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { AquaApp } from "@1inch/aqua/src/AquaApp.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { IMakerHooks } from "@1inch/swap-vm/src/interfaces/IMakerHooks.sol";

import { ICreditRegistry } from "./interfaces/ICreditRegistry.sol";
import { IPriceFeed } from "./interfaces/IPriceFeed.sol";
import { StrategyBuilder } from "./StrategyBuilder.sol";

/// @title CreditPositionRegistry
/// @notice AquaPrime credit engine.
///   * Lenders never deposit: they `aqua.ship()` a credit-line strategy with this contract as the app.
///     USDC is `aqua.pull()`ed from the lender wallet only at borrow time and `aqua.push()`ed back on
///     repayment / liquidation. Capital stays in the lender's EOA and can back other Aqua strategies.
///   * Borrowers escrow collateral (WETH) here. Liquidation ratio depends on tier:
///       anonymous 150%, World ID verified human 115% (+ grace window before liquidation).
///   * When HF < 1 anyone can start a liquidation: the registry itself ships a SwapVM order into
///     Aqua whose program is guarded by opcode 0xf0 (SolvencyDutchGuard) so only the exact slice
///     that restores HF to the target can be bought, at a linearly increasing Dutch discount.
///   * Revenue: reserve factor on interest + protocol fee on liquidated collateral → treasury.
contract CreditPositionRegistry is AquaApp, ICreditRegistry, IMakerHooks, EIP712, Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // ───────────────────────────── constants ─────────────────────────────
    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;
    uint8 internal constant AQUA_DOCKED = 0xff;
    bytes32 public constant HUMAN_ATTESTATION_TYPEHASH =
        keccak256("HumanAttestation(address wallet,uint256 nullifier,uint256 deadline)");

    // ───────────────────────────── immutables ────────────────────────────
    address public immutable override COLLATERAL_TOKEN;
    address public immutable override DEBT_TOKEN;
    address public immutable ROUTER;
    StrategyBuilder public immutable BUILDER;
    uint8 public immutable COLLATERAL_DECIMALS;

    // ───────────────────────────── config ────────────────────────────────
    struct RiskParams {
        uint16 anonRatioBps;        // 15000 = 150% collateral ratio
        uint16 humanRatioBps;       // 11500 = 115%
        uint16 targetHfBps;         // 10200 = liquidations restore HF to exactly 1.02
        uint16 startDiscountBps;    // Dutch auction opening discount
        uint16 maxDiscountBps;      // Dutch auction max discount
        uint32 auctionDuration;     // seconds to ramp from start to max discount
        uint32 humanGracePeriod;    // seconds before a verified human's auction opens
        uint16 liquidationFeeBps;   // protocol fee on seized collateral
        uint16 reserveFactorBps;    // protocol share of interest
        uint32 maxPriceStaleness;   // oracle freshness bound
    }

    RiskParams public params;
    IPriceFeed public priceFeed;
    address public treasury;
    address public humanAttester;
    bool public borrowPaused;

    // ───────────────────────────── state ─────────────────────────────────
    struct CreditLine {
        address lender;
        uint32 aprBps;
        uint64 salt;
        bool registered;
    }

    struct Position {
        uint256 collateral;
        uint256 principal;
        uint256 interest;
        uint64 lastAccrual;
        uint32 aprBps;
        bytes32 creditLine;
        // liquidation auction
        bool auctionActive;
        uint64 auctionStart;
        uint64 auctionNonce;
        bytes32 auctionHash;   // Aqua strategy hash (== SwapVM order hash) while shipped
    }

    mapping(bytes32 strategyHash => CreditLine) public creditLines;
    bytes32[] public creditLineList;
    mapping(address borrower => Position) internal _positions;
    mapping(address wallet => uint256 nullifier) public humanNullifierOf;
    mapping(uint256 nullifier => address wallet) public walletOfNullifier;

    uint256 public totalProtocolInterestRevenue;
    uint256 public totalProtocolLiquidationRevenue;
    uint256 public totalBadDebt;

    // ───────────────────────────── events ────────────────────────────────
    event CreditLineRegistered(bytes32 indexed strategyHash, address indexed lender, uint32 aprBps, uint64 salt);
    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, bytes32 indexed creditLine, uint256 amount);
    event Repaid(address indexed borrower, address indexed payer, uint256 principal, uint256 interest, uint256 protocolCut);
    event HumanVerified(address indexed wallet, uint256 indexed nullifier);
    event AuctionStarted(address indexed borrower, bytes32 indexed orderHash, uint64 nonce, uint64 auctionStart, uint256 healthFactor);
    event AuctionClosed(address indexed borrower, bytes32 indexed orderHash);
    event SurgicalLiquidation(
        address indexed borrower,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 protocolFee,
        uint256 healthFactorAfter
    );
    event BadDebt(address indexed borrower, uint256 amount);
    event ParamsUpdated(RiskParams params);
    event PriceFeedUpdated(address feed);
    event TreasuryUpdated(address treasury);
    event AttesterUpdated(address attester);
    event BorrowPaused(bool paused);

    // ───────────────────────────── errors ────────────────────────────────
    error ZeroAmount();
    error InvalidParams();
    error CreditLineNotActive(bytes32 strategyHash);
    error CreditLineMismatch(bytes32 current, bytes32 requested);
    error InsufficientHealth(uint256 healthFactorAfter);
    error AuctionInProgress(address borrower);
    error AuctionNotActive(address borrower);
    error PositionNotLiquidatable(uint256 healthFactor);
    error PositionStillLiquidatable(uint256 healthFactor);
    error OnlyRouter();
    error UnexpectedOrder();
    error HookNotSupported();
    error StalePrice(uint256 updatedAt);
    error InvalidPrice();
    error AttestationExpired();
    error InvalidAttestation();
    error NullifierAlreadyBound(address wallet);
    error BorrowingPaused();
    error InsufficientCollateral();

    constructor(
        IAqua aqua,
        address router,
        StrategyBuilder builder,
        address collateralToken,
        address debtToken,
        IPriceFeed feed,
        address treasury_,
        address attester_,
        address owner_
    ) AquaApp(aqua) EIP712("AquaPrime", "1") Ownable(owner_) {
        ROUTER = router;
        BUILDER = builder;
        COLLATERAL_TOKEN = collateralToken;
        DEBT_TOKEN = debtToken;
        COLLATERAL_DECIMALS = IERC20Metadata(collateralToken).decimals();
        priceFeed = feed;
        treasury = treasury_;
        humanAttester = attester_;
        _setParams(RiskParams({
            anonRatioBps: 15_000,
            humanRatioBps: 11_500,
            targetHfBps: 10_200,
            startDiscountBps: 150,
            maxDiscountBps: 600,
            auctionDuration: 600,
            humanGracePeriod: 180,
            liquidationFeeBps: 50,
            reserveFactorBps: 1_000,
            maxPriceStaleness: 3_600
        }));
        // Registry is the Aqua maker of its liquidation strategies and pushes repayments to lenders.
        IERC20(collateralToken).forceApprove(address(aqua), type(uint256).max);
        IERC20(debtToken).forceApprove(address(aqua), type(uint256).max);
    }

    // ═════════════════════════════ admin ═════════════════════════════════

    function setParams(RiskParams calldata p) external onlyOwner { _setParams(p); }

    function _setParams(RiskParams memory p) internal {
        // Liquidations must always be able to *improve* HF up to the target:
        //   targetHf * ratio * (1 - maxDiscount) > (1 + fee)   for both tiers
        uint256 lhs = uint256(p.targetHfBps) * p.humanRatioBps * (BPS - p.maxDiscountBps);
        uint256 rhs = (BPS + p.liquidationFeeBps) * BPS * BPS;
        require(
            p.humanRatioBps > BPS && p.anonRatioBps >= p.humanRatioBps && p.targetHfBps >= BPS &&
            p.startDiscountBps <= p.maxDiscountBps && p.maxDiscountBps < BPS && p.auctionDuration > 0 &&
            p.reserveFactorBps <= BPS && lhs > rhs,
            InvalidParams()
        );
        params = p;
        emit ParamsUpdated(p);
    }

    function setPriceFeed(IPriceFeed feed) external onlyOwner { priceFeed = feed; emit PriceFeedUpdated(address(feed)); }
    function setTreasury(address t) external onlyOwner { treasury = t; emit TreasuryUpdated(t); }
    function setHumanAttester(address a) external onlyOwner { humanAttester = a; emit AttesterUpdated(a); }
    /// @notice Pausing only blocks *new* borrowing. Repay, top-up and liquidation always work.
    function setBorrowPaused(bool p) external onlyOwner { borrowPaused = p; emit BorrowPaused(p); }

    // ═════════════════════════ lender: credit lines ══════════════════════

    /// @notice Canonical Aqua strategy bytes a lender ships for a credit line.
    function creditLineStrategy(address lender, uint32 aprBps, uint64 salt)
        public view returns (bytes memory strategy, bytes32 strategyHash)
    {
        strategy = abi.encode(lender, DEBT_TOKEN, aprBps, salt);
        strategyHash = keccak256(strategy);
    }

    /// @notice Register a credit line the caller already shipped via `aqua.ship(registry, strategy, [DEBT], [cap])`.
    function registerCreditLine(uint32 aprBps, uint64 salt) external returns (bytes32 strategyHash) {
        (, strategyHash) = creditLineStrategy(msg.sender, aprBps, salt);
        (, uint8 count) = AQUA.rawBalances(msg.sender, address(this), strategyHash, DEBT_TOKEN);
        require(count == 1, CreditLineNotActive(strategyHash));
        CreditLine storage cl = creditLines[strategyHash];
        if (!cl.registered) {
            creditLines[strategyHash] = CreditLine({ lender: msg.sender, aprBps: aprBps, salt: salt, registered: true });
            creditLineList.push(strategyHash);
            emit CreditLineRegistered(strategyHash, msg.sender, aprBps, salt);
        }
    }

    function creditLineCount() external view returns (uint256) { return creditLineList.length; }

    /// @notice Remaining virtual USDC a credit line can still lend (0 if docked / not active).
    function creditLineAvailable(bytes32 strategyHash) public view returns (uint256) {
        CreditLine memory cl = creditLines[strategyHash];
        if (!cl.registered) return 0;
        (uint248 bal, uint8 count) = AQUA.rawBalances(cl.lender, address(this), strategyHash, DEBT_TOKEN);
        if (count == 0 || count == AQUA_DOCKED) return 0;
        return bal;
    }

    // ═══════════════════════════ World ID tier ═══════════════════════════

    /// @notice Upgrade caller to the Human Prime tier using an attestation produced by the AquaPrime
    ///         backend after it verified a World ID Proof-of-Human with the Developer Portal API
    ///         (signal = caller wallet). One nullifier (= one human) can bind exactly one wallet.
    function verifyHuman(uint256 nullifier, uint256 deadline, bytes calldata signature) external {
        require(block.timestamp <= deadline, AttestationExpired());
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(HUMAN_ATTESTATION_TYPEHASH, msg.sender, nullifier, deadline)));
        require(ECDSA.recover(digest, signature) == humanAttester && humanAttester != address(0), InvalidAttestation());
        address bound = walletOfNullifier[nullifier];
        require(bound == address(0) || bound == msg.sender, NullifierAlreadyBound(bound));
        walletOfNullifier[nullifier] = msg.sender;
        humanNullifierOf[msg.sender] = nullifier;
        emit HumanVerified(msg.sender, nullifier);
    }

    function isHuman(address wallet) public view returns (bool) { return humanNullifierOf[wallet] != 0; }

    function liquidationRatioBps(address borrower) public view returns (uint256) {
        return isHuman(borrower) ? params.humanRatioBps : params.anonRatioBps;
    }

    // ═══════════════════════════ borrower actions ════════════════════════

    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, ZeroAmount());
        IERC20(COLLATERAL_TOKEN).safeTransferFrom(msg.sender, address(this), amount);
        _positions[msg.sender].collateral += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        Position storage p = _positions[msg.sender];
        require(amount > 0, ZeroAmount());
        require(!p.auctionActive, AuctionInProgress(msg.sender));
        require(p.collateral >= amount, InsufficientCollateral());
        _accrue(p);
        p.collateral -= amount;
        uint256 hf = _healthFactor(msg.sender, p);
        require(hf >= 1e18, InsufficientHealth(hf));
        IERC20(COLLATERAL_TOKEN).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Borrow `amount` of DEBT_TOKEN pulled just-in-time from a lender wallet via Aqua.
    function borrow(uint256 amount, bytes32 creditLine) external nonReentrant {
        require(!borrowPaused, BorrowingPaused());
        require(amount > 0, ZeroAmount());
        CreditLine memory cl = creditLines[creditLine];
        require(cl.registered, CreditLineNotActive(creditLine));
        Position storage p = _positions[msg.sender];
        require(!p.auctionActive, AuctionInProgress(msg.sender));
        _accrue(p);
        if (p.principal + p.interest == 0) {
            p.creditLine = creditLine;
            p.aprBps = cl.aprBps;
            p.lastAccrual = uint64(block.timestamp);
        } else {
            require(p.creditLine == creditLine, CreditLineMismatch(p.creditLine, creditLine));
        }
        p.principal += amount;
        uint256 hf = _healthFactor(msg.sender, p);
        require(hf >= 1e18, InsufficientHealth(hf));
        // Zero-custody: USDC moves lender wallet -> borrower wallet in one Aqua pull.
        AQUA.pull(cl.lender, creditLine, DEBT_TOKEN, amount, msg.sender);
        emit Borrowed(msg.sender, creditLine, amount);
    }

    /// @notice Repay debt for `borrower` (anyone can repay). Excess is not taken.
    function repay(address borrower, uint256 amount) external nonReentrant returns (uint256 paid) {
        require(amount > 0, ZeroAmount());
        Position storage p = _positions[borrower];
        _accrue(p);
        paid = Math.min(amount, p.principal + p.interest);
        require(paid > 0, ZeroAmount());
        IERC20(DEBT_TOKEN).safeTransferFrom(msg.sender, address(this), paid);
        _applyRepayment(borrower, p, paid, msg.sender);
    }

    // ═══════════════════════════ liquidation ═════════════════════════════

    /// @notice Permissionless: ship a 0xf0-guarded SwapVM Dutch auction for an insolvent position.
    function startAuction(address borrower) external nonReentrant returns (bytes32 orderHash) {
        Position storage p = _positions[borrower];
        require(!p.auctionActive, AuctionInProgress(borrower));
        _accrue(p);
        uint256 hf = _healthFactor(borrower, p);
        require(hf < 1e18, PositionNotLiquidatable(hf));

        _dockIfShipped(borrower, p);

        uint64 nonce = p.auctionNonce + 1;
        p.auctionNonce = nonce;
        ISwapVM.Order memory order = _auctionOrder(borrower, nonce);
        bytes memory strategy = abi.encode(order);

        address[] memory tokens = new address[](2);
        tokens[0] = COLLATERAL_TOKEN;
        tokens[1] = DEBT_TOKEN;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = p.collateral;
        orderHash = AQUA.ship(ROUTER, strategy, tokens, amounts);

        uint64 start = uint64(block.timestamp) + (isHuman(borrower) ? params.humanGracePeriod : 0);
        p.auctionActive = true;
        p.auctionStart = start;
        p.auctionHash = orderHash;
        emit AuctionStarted(borrower, orderHash, nonce, start, hf);
    }

    /// @notice Permissionless: close an auction once the position is solvent again (or empty).
    function closeAuction(address borrower) external nonReentrant {
        Position storage p = _positions[borrower];
        require(p.auctionHash != bytes32(0), AuctionNotActive(borrower));
        _accrue(p);
        uint256 hf = _healthFactor(borrower, p);
        if (p.auctionActive) {
            require(hf >= 1e18 || p.collateral == 0, PositionStillLiquidatable(hf));
            p.auctionActive = false;
        }
        _dockIfShipped(borrower, p);
    }

    /// @notice SwapVM maker hook — invoked by AquaPrimeRouter after the liquidator pushed DEBT_TOKEN
    ///         into this registry through Aqua and pulled the collateral slice out.
    function postTransferIn(
        address maker,
        address taker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 orderHash,
        bytes calldata makerData,
        bytes calldata /* takerData */
    ) external override nonReentrant {
        require(msg.sender == ROUTER, OnlyRouter());
        require(maker == address(this) && tokenIn == DEBT_TOKEN && tokenOut == COLLATERAL_TOKEN, UnexpectedOrder());
        address borrower = abi.decode(makerData, (address));
        Position storage p = _positions[borrower];
        require(p.auctionActive && p.auctionHash == orderHash, UnexpectedOrder());

        _accrue(p);

        // collateral: slice to the liquidator (already pulled by Aqua) + protocol fee to treasury
        uint256 fee = Math.min(amountOut * params.liquidationFeeBps / BPS, p.collateral - amountOut);
        p.collateral -= amountOut + fee;
        if (fee > 0) {
            totalProtocolLiquidationRevenue += fee;
            IERC20(COLLATERAL_TOKEN).safeTransfer(treasury, fee);
        }

        // debt: repay lender through Aqua; refund any surplus to the borrower
        uint256 debt = p.principal + p.interest;
        uint256 repayAmt = Math.min(amountIn, debt);
        if (repayAmt > 0) _applyRepayment(borrower, p, repayAmt, taker);
        if (amountIn > repayAmt) IERC20(DEBT_TOKEN).safeTransfer(borrower, amountIn - repayAmt);

        if (p.collateral == 0 && p.principal + p.interest > 0) {
            uint256 bad = p.principal + p.interest;
            totalBadDebt += bad;
            emit BadDebt(borrower, bad);
        }

        uint256 hf = _healthFactor(borrower, p);
        // Solvent again → stop the auction. Docking is done by closeAuction (keeps Aqua pull ordering safe).
        if (hf >= 1e18 || p.collateral == 0) p.auctionActive = false;

        emit SurgicalLiquidation(borrower, taker, repayAmt, amountOut, fee, hf);
    }

    function preTransferIn(address, address, address, address, uint256, uint256, bytes32, bytes calldata, bytes calldata) external pure override { revert HookNotSupported(); }
    function preTransferOut(address, address, address, address, uint256, uint256, bytes32, bytes calldata, bytes calldata) external pure override { revert HookNotSupported(); }
    function postTransferOut(address, address, address, address, uint256, uint256, bytes32, bytes calldata, bytes calldata) external pure override { revert HookNotSupported(); }

    // ═════════════════════════════ views ═════════════════════════════════

    struct PositionView {
        uint256 collateral;
        uint256 debt;
        uint256 principal;
        uint256 interest;
        uint256 healthFactor;
        uint256 liquidationRatioBps;
        uint256 maxBorrowable;
        uint32 aprBps;
        bytes32 creditLine;
        bool human;
        bool auctionActive;
        uint64 auctionStart;
        bytes32 auctionHash;
    }

    function position(address borrower) external view returns (PositionView memory v) {
        Position memory p = _positions[borrower];
        (uint256 principal, uint256 interest) = _accrued(p);
        p.principal = principal;
        p.interest = interest;
        uint256 ratio = liquidationRatioBps(borrower);
        uint256 maxDebt = _collateralValue(p.collateral, _price()) * BPS / ratio;
        uint256 debt = principal + interest;
        v = PositionView({
            collateral: p.collateral,
            debt: debt,
            principal: principal,
            interest: interest,
            healthFactor: _healthFactor(borrower, p),
            liquidationRatioBps: ratio,
            maxBorrowable: maxDebt > debt ? maxDebt - debt : 0,
            aprBps: p.aprBps,
            creditLine: p.creditLine,
            human: isHuman(borrower),
            auctionActive: p.auctionActive,
            auctionStart: p.auctionStart,
            auctionHash: p.auctionHash
        });
    }

    function healthFactor(address borrower) external view returns (uint256) {
        Position memory p = _positions[borrower];
        (p.principal, p.interest) = _accrued(p);
        return _healthFactor(borrower, p);
    }

    /// @inheritdoc ICreditRegistry
    function liquidationQuote(address borrower) public view override returns (LiquidationQuote memory q) {
        Position memory p = _positions[borrower];
        (p.principal, p.interest) = _accrued(p);
        uint256 price = _price();
        q.healthFactor = _healthFactor(borrower, p);
        q.auctionActive = p.auctionActive;
        q.auctionStart = p.auctionStart;
        q.discountBps = currentDiscountBps(borrower);
        if (q.healthFactor >= 1e18) return q;
        (q.debtToCover, q.collateralOut) = _surgicalSlice(
            p.collateral, p.principal + p.interest, price, liquidationRatioBps(borrower), q.discountBps
        );
    }

    function currentDiscountBps(address borrower) public view returns (uint256) {
        Position memory p = _positions[borrower];
        RiskParams memory rp = params;
        if (!p.auctionActive || block.timestamp <= p.auctionStart) return rp.startDiscountBps;
        uint256 elapsed = Math.min(block.timestamp - p.auctionStart, rp.auctionDuration);
        return rp.startDiscountBps + (uint256(rp.maxDiscountBps) - rp.startDiscountBps) * elapsed / rp.auctionDuration;
    }

    /// @notice The live SwapVM order a liquidator fills for `borrower`'s active auction.
    function auctionOrder(address borrower) external view returns (ISwapVM.Order memory) {
        Position memory p = _positions[borrower];
        require(p.auctionHash != bytes32(0), AuctionNotActive(borrower));
        return _auctionOrder(borrower, p.auctionNonce);
    }

    /// @notice DEBT_TOKEN per 1 whole COLLATERAL_TOKEN, in DEBT_TOKEN decimals.
    function price() external view returns (uint256) { return _price(); }

    // ═════════════════════════════ internals ═════════════════════════════

    function _auctionOrder(address borrower, uint64 nonce) internal view returns (ISwapVM.Order memory) {
        return BUILDER.buildAuctionOrder(address(this), COLLATERAL_TOKEN, DEBT_TOKEN, borrower, nonce);
    }

    function _dockIfShipped(address borrower, Position storage p) internal {
        bytes32 h = p.auctionHash;
        if (h == bytes32(0)) return;
        (, uint8 count) = AQUA.rawBalances(address(this), ROUTER, h, COLLATERAL_TOKEN);
        if (count != 0 && count != AQUA_DOCKED) {
            address[] memory tokens = new address[](2);
            tokens[0] = COLLATERAL_TOKEN;
            tokens[1] = DEBT_TOKEN;
            AQUA.dock(ROUTER, h, tokens);
        }
        p.auctionHash = bytes32(0);
        p.auctionActive = false;
        emit AuctionClosed(borrower, h);
    }

    /// @dev Surgical slice: repay x so that HF after == target, given the liquidator discount d and
    ///      protocol fee f taken from collateral.  Solving  V - x(1+f)/(1-d) = T·R·(D - x):
    ///        x = (T·R·D - V)(1-d) / (T·R(1-d) - (1+f))           (all in bps fixed-point)
    function _surgicalSlice(uint256 collateral, uint256 debt, uint256 price_, uint256 ratioBps, uint256 discountBps)
        internal view returns (uint256 debtToCover, uint256 collateralOut)
    {
        if (debt == 0 || collateral == 0) return (0, 0);
        RiskParams memory rp = params;
        uint256 value = _collateralValue(collateral, price_);
        uint256 tr = uint256(rp.targetHfBps) * ratioBps; // bps^2
        uint256 num = tr * debt;                         // debt * bps^2
        uint256 vScaled = value * BPS * BPS;
        if (num > vScaled) {
            uint256 den = tr * (BPS - discountBps) - (BPS + rp.liquidationFeeBps) * BPS * BPS; // > 0 by _setParams
            debtToCover = Math.mulDiv(num - vScaled, BPS - discountBps, den);
        }
        if (debtToCover > debt) debtToCover = debt;
        // collateral the liquidator receives: x / (P·(1-d))
        collateralOut = Math.mulDiv(debtToCover * BPS, 10 ** COLLATERAL_DECIMALS, price_ * (BPS - discountBps));
        // insolvency: cannot hand out more than the collateral net of protocol fee
        uint256 maxOut = collateral * BPS / (BPS + rp.liquidationFeeBps);
        if (collateralOut > maxOut) {
            collateralOut = maxOut;
            debtToCover = Math.mulDiv(collateralOut * price_, BPS - discountBps, BPS * 10 ** COLLATERAL_DECIMALS);
        }
    }

    function _applyRepayment(address borrower, Position storage p, uint256 amount, address payer) internal {
        uint256 interestPaid = Math.min(amount, p.interest);
        uint256 principalPaid = amount - interestPaid;
        p.interest -= interestPaid;
        p.principal -= principalPaid;
        uint256 cut = interestPaid * params.reserveFactorBps / BPS;
        if (cut > 0) {
            totalProtocolInterestRevenue += cut;
            IERC20(DEBT_TOKEN).safeTransfer(treasury, cut);
        }
        _pushToLender(p.creditLine, amount - cut);
        emit Repaid(borrower, payer, principalPaid, interestPaid, cut);
    }

    /// @dev Returns capital to the lender wallet. If the credit line is still active it is re-credited
    ///      via `aqua.push` (restoring lending capacity); if docked, it is a plain transfer.
    function _pushToLender(bytes32 creditLine, uint256 amount) internal {
        if (amount == 0) return;
        CreditLine memory cl = creditLines[creditLine];
        (, uint8 count) = AQUA.rawBalances(cl.lender, address(this), creditLine, DEBT_TOKEN);
        if (count != 0 && count != AQUA_DOCKED) {
            AQUA.push(cl.lender, address(this), creditLine, DEBT_TOKEN, amount);
        } else {
            IERC20(DEBT_TOKEN).safeTransfer(cl.lender, amount);
        }
    }

    function _accrued(Position memory p) internal view returns (uint256 principal, uint256 interest) {
        principal = p.principal;
        interest = p.interest;
        if (p.lastAccrual != 0 && block.timestamp > p.lastAccrual && p.aprBps != 0) {
            interest += Math.mulDiv(principal + interest, uint256(p.aprBps) * (block.timestamp - p.lastAccrual), BPS * YEAR);
        }
    }

    function _accrue(Position storage p) internal {
        (p.principal, p.interest) = _accrued(p);
        p.lastAccrual = uint64(block.timestamp);
    }

    function _healthFactor(address borrower, Position memory p) internal view returns (uint256) {
        uint256 debt = p.principal + p.interest;
        if (debt == 0) return type(uint256).max;
        return Math.mulDiv(_collateralValue(p.collateral, _price()), 1e18 * BPS, debt * liquidationRatioBps(borrower));
    }

    function _collateralValue(uint256 amount, uint256 price_) internal view returns (uint256) {
        return Math.mulDiv(amount, price_, 10 ** COLLATERAL_DECIMALS);
    }

    function _price() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        require(answer > 0, InvalidPrice());
        uint256 staleness = params.maxPriceStaleness;
        require(staleness == 0 || block.timestamp <= updatedAt + staleness, StalePrice(updatedAt));
        uint8 debtDecimals = IERC20Metadata(DEBT_TOKEN).decimals();
        uint8 feedDecimals = priceFeed.decimals();
        return Math.mulDiv(uint256(answer), 10 ** debtDecimals, 10 ** feedDecimals);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Read surface of CreditPositionRegistry consumed by the SwapVM 0xf0 opcode.
interface ICreditRegistry {
    /// @param healthFactor     Collateral value / (debt * liquidation ratio), 1e18 = 1.0
    /// @param debtToCover      Max debt-token amount a liquidator may repay right now (surgical slice)
    /// @param collateralOut    Collateral the liquidator receives for repaying `debtToCover`
    /// @param auctionStart     Timestamp the Dutch auction starts (after human grace window)
    /// @param discountBps      Current Dutch-auction discount offered to liquidators (bps)
    /// @param auctionActive    True while the registry has a shipped auction strategy for the borrower
    struct LiquidationQuote {
        uint256 healthFactor;
        uint256 debtToCover;
        uint256 collateralOut;
        uint256 auctionStart;
        uint256 discountBps;
        bool auctionActive;
    }

    function liquidationQuote(address borrower) external view returns (LiquidationQuote memory);
    function DEBT_TOKEN() external view returns (address);
    function COLLATERAL_TOKEN() external view returns (address);
}

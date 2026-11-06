// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPriceFeed } from "../interfaces/IPriceFeed.sol";

/// @title OperatorPriceFeed
/// @notice AggregatorV3-compatible feed for local forks / stress tests, where the real Chainlink feed
///         cannot be moved. Production deployments point CreditPositionRegistry at Chainlink
///         (e.g. ETH/USD 0x694AA1769357215DE4FAC081bf1f309aDC325306 on Sepolia) instead.
///         Optionally seeded from a live Chainlink feed so the fork starts at the real price.
contract OperatorPriceFeed is IPriceFeed, Ownable {
    uint8 public immutable override decimals;
    string public description;

    uint80 internal _roundId;
    int256 internal _answer;
    uint256 internal _updatedAt;

    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    constructor(uint8 decimals_, string memory description_, int256 initialAnswer, address owner_) Ownable(owner_) {
        decimals = decimals_;
        description = description_;
        _set(initialAnswer);
    }

    function setAnswer(int256 answer) external onlyOwner { _set(answer); }

    /// @notice Copy the latest answer from a real Chainlink aggregator (same decimals required).
    function syncFrom(IPriceFeed source) external onlyOwner {
        require(source.decimals() == decimals, "decimals");
        (, int256 a,,,) = source.latestRoundData();
        _set(a);
    }

    /// @notice Re-stamp the current answer (keeps the feed fresh on long-running local nodes).
    function heartbeat() external onlyOwner { _set(_answer); }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function _set(int256 answer) internal {
        require(answer > 0, "answer");
        _roundId++;
        _answer = answer;
        _updatedAt = block.timestamp;
        emit AnswerUpdated(answer, _roundId, block.timestamp);
    }
}

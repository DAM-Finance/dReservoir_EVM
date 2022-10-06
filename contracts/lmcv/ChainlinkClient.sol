// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity >=0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract ChainlinkClient {

    AggregatorV3Interface internal priceFeed;

    constructor(address priceFeedAddress) {
        priceFeed = AggregatorV3Interface(priceFeedAddress);
    }

    /**
     * Returns the latest price
     */
    function getLatestPrice() public view returns (int256) {
        (
            uint80 roundID,
            int256 price,
            /*uint startedAt*/,
            uint timestamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        // Revert on any invalid data.
        require(answeredInRound >= roundID, "ChainLinkClient/Stale price.");
        require(price > 0, "ChainLinkClient/Invalid price.");
        require(timestamp != 0, "ChainLinkClient/Round not complete.");

        return price;
    }
}
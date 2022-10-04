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
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        require(price > 0, "Price must be higher than 0");
        require(timeStamp != 0, "Time stamp must not be 0");
        require(answeredInRound >= roundID, "Must not be stale price");
        return price;
    }
}
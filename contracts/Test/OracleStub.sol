// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity >=0.8.7;

// TODO: Should implement the right interface.

import "hardhat/console.sol";

contract OracleStub {
    uint256 public value = 0;
    uint256 public random = 0;
    uint256 private nonce = 0;

    uint256 constant RAY = 10 ** 27;

    function nextValue() external {
        value++;
    }

    function rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    function nextRandom() external {
        uint256 randomNumber = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, nonce))) % 1000;
        random = randomNumber * RAY / 100;
        nonce++;
    }
}
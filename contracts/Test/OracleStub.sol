// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity >=0.8.12;

contract OracleStub {
    string  wut;
    uint256 val;
    bool    has = false;

    uint256 private nonce = 0;
    uint256 private constant RAY = 10 ** 27;

    constructor (string memory _wut) {
        wut = _wut;
    }

    function poke() external {
        uint256 randomNumber = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, ++nonce))) % 1000;
        val = randomNumber * RAY / 1000;
        has = true;
    }

    function peek() external view returns (uint256, bool) {
        return (val, has);
    }

    function what() external view returns (string memory) {
        return wut;
    }
}
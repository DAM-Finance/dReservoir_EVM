// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.14;

import "hardhat/console.sol";

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function pushDPrime(address src, uint256 rad) external;
    function pullDPrime(address src, uint256 rad) external;
}

contract dPrimeJoin {
    LMCVLike public immutable lmcv;         // CDP Engine
    dPrimeLike public immutable dPrime;     // Stablecoin Token
    uint256 constant RAY = 10 ** 27;
    uint256 mintFee;                        // [ray]
    address treasury;

    // --- Events ---
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    constructor(address _lmcv, address _dPrime, address _treasury, uint256 _mintFee) {
        lmcv = LMCVLike(_lmcv);
        dPrime = dPrimeLike(_dPrime);
        mintFee = _mintFee;
        treasury = _treasury;
    }

    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    // --- User's functions ---
    function join(address usr, uint256 wad) external {
        dPrime.burn(msg.sender, wad);
        lmcv.pushDPrime(usr, wad * RAY);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        uint256 fee = _rmul(wad, mintFee); // [wad]
        lmcv.pullDPrime(msg.sender, wad * RAY);
        dPrime.mint(treasury, fee);
        dPrime.mint(usr, wad-fee);
        emit Exit(usr, wad);
    }
}

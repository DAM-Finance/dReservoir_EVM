// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.7;

import "hardhat/console.sol";

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function moveDPrime(address src, address dst, uint256 frad) external;
    function dPrime(address user) external returns (uint256);
}

contract dPrimeJoin {

    //
    // --- Interfaces and data ---
    //

    LMCVLike    public immutable    lmcv;
    dPrimeLike  public immutable    dPrime;
    uint256     constant            RAY = 10 ** 27;
    address                         lmcvProxy;

    //
    // --- Events ---
    //

    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Modifiers ---
    //

    modifier auth {
        require(msg.sender == lmcvProxy, "dPrimeJoin/not-authorized");
        _;
    }

    //
    // --- Init ---
    //

    constructor(address _lmcv, address _dPrime, address _lmcvProxy) {
        require(_lmcv != address(0x0)
            && _dPrime != address(0x0)
            && _lmcvProxy != address(0x0),
            "dPrimeJoin/Can't be zero address"
        );
        lmcv = LMCVLike(_lmcv);
        dPrime = dPrimeLike(_dPrime);
        lmcvProxy = _lmcvProxy;
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external {
        lmcv.moveDPrime(address(this), usr, RAY * wad);
        dPrime.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        lmcv.moveDPrime(msg.sender, address(this), RAY * wad);
        dPrime.mint(usr, wad);
        emit Exit(usr, wad);
    }

    function proxyExit(address usr, uint256 wad) external auth {
        lmcv.moveDPrime(usr, address(this), RAY * wad);
        dPrime.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

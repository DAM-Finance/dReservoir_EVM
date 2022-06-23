// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function pushDPrime(address src, uint256 rad) external;
    function pullDPrime(address src, uint256 rad) external;
}

contract Liquidation { //TODO: Turn this contract into staking contract instead???? 
//Then staking contract can control the liquidationDPrime amounts

    LMCVLike public immutable lmcv;         // CDP Engine
    dPrimeLike public immutable dPrime;     // Stablecoin Token

    constructor(address _lmcv, address _dPrime) {
        lmcv = LMCVLike(_lmcv);
        dPrime = dPrimeLike(_dPrime);
    }

}

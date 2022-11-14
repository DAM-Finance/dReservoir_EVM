// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.12;

import "hardhat/console.sol";

interface ddPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface StakingVaultLike {
    function moveDDPrime(address src, address dst, uint256 frad) external;
}

contract ddPrimeJoin {

    //
    // --- Interfaces and data ---
    //

    StakingVaultLike    public immutable    stakingVault;
    ddPrimeLike         public immutable    ddPrime;
    uint256             constant            RAY = 10 ** 27;

    //
    // --- Events ---
    //

    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Init ---
    //

    constructor(address _stakingVault, address _ddPrime) {
        require(_stakingVault != address(0x0)
            && _ddPrime != address(0x0),
            "ddPrimeJoin/Can't be zero address"
        );
        stakingVault = StakingVaultLike(_stakingVault);
        ddPrime = ddPrimeLike(_ddPrime);
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external {
        stakingVault.moveDDPrime(address(this), usr, RAY * wad);
        ddPrime.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        stakingVault.moveDDPrime(msg.sender, address(this), RAY * wad);
        ddPrime.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

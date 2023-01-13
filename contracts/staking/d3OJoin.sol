// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.12;

interface d3OLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface StakingVaultLike {
    function moveD3O(address src, address dst, uint256 frad) external;
}

contract d3OJoin {

    //
    // --- Interfaces and data ---
    //

    StakingVaultLike    public immutable    stakingVault;
    d3OLike             public immutable    d3O;
    uint256             constant            RAY = 10 ** 27;

    //
    // --- Events ---
    //

    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Init ---
    //

    constructor(address _stakingVault, address _d3O) {
        require(_stakingVault != address(0x0)
            && _d3O != address(0x0),
            "d3OJoin/Can't be zero address"
        );
        stakingVault = StakingVaultLike(_stakingVault);
        d3O = d3OLike(_d3O);
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external {
        stakingVault.moveD3O(address(this), usr, RAY * wad);
        d3O.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        stakingVault.moveD3O(msg.sender, address(this), RAY * wad);
        d3O.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

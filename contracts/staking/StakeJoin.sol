// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.7;

interface CollateralLike {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface StakingVaultLike {
    function pushStakingToken(bytes32, address, uint256) external;
    function pullStakingToken(bytes32, address, uint256) external;
}

/*
 TODO: Description
*/
contract StakeJoin {
    
    // 
    // --- Auth ---
    //

    mapping(address => uint256) public wards;

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    //
    // --- Interfaces and data ---
    //

    StakingVaultLike    public immutable    stakingVault;
    CollateralLike      public immutable    collateralContract;
    bytes32             public immutable    collateralName;
    uint256             public              live;

    //
    // --- Events ---
    //

    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event Cage();
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Modifiers ---
    //

    modifier auth {
        require(wards[msg.sender] == 1, "CollateralJoin/not-authorized");
        _;
    }

    //
    // --- Admin ---
    //

    function cage() external auth {
        live = 0;
        emit Cage();
    }

    //
    // --- Init ---
    //

    constructor(address stakingVault_, bytes32 collateralName_, address collateralContract_) {
        wards[msg.sender] = 1;
        live = 1;
        stakingVault = StakingVaultLike(stakingVault_);
        collateralName = collateralName_;
        collateralContract = CollateralLike(collateralContract_);
        emit Rely(msg.sender);
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external auth {
        require(live == 1, "CollateralJoin/not-live");
        require(collateralContract.transferFrom(msg.sender, address(this), wad), "CollateralJoin/failed-transfer");
        stakingVault.pushStakingToken(collateralName, usr, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        require(live == 1, "CollateralJoin/not-live");
        stakingVault.pullStakingToken(collateralName, msg.sender, wad);
        require(collateralContract.transfer(usr, wad), "CollateralJoin/failed-transfer");
        emit Exit(usr, wad);
    }
}

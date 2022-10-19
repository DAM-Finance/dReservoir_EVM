// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.12;

interface CollateralLike {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface StakingVaultLike {
    function pushRewards(bytes32, uint256) external;
    function pullRewards(bytes32, address, uint256) external;
    function removeRewards(bytes32, uint256) external;
}

/*
    Much like LMCV CollateralJoin, except the admin is probably the only person pushing rewards in
    And there is no ability to remove them because that would break the StakingVault math
*/
contract RewardJoin {
    
    // 
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "RewardJoin/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "RewardJoin/ArchAdmin cannot lose admin - update ArchAdmin to another address");
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
    event Cage(uint256 status);
    event Join(uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Modifiers ---
    //

    modifier auth {
        require(wards[msg.sender] == 1, "RewardJoin/not-authorized");
        _;
    }

    //
    // --- Admin ---
    //

    function cage(uint256 status) external auth {
        live = status;
        emit Cage(status);
    }

    //
    // --- Init ---
    //

    constructor(address stakingVault_, bytes32 collateralName_, address collateralContract_) {
        require(stakingVault_ != address(0) && collateralContract_ != address(0), "RewardJoin/Address cannot be zero");
        ArchAdmin = msg.sender;
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

    function join(uint256 wad) external {
        require(live == 1, "RewardJoin/not-live");
        require(collateralContract.transferFrom(msg.sender, address(this), wad), "RewardJoin/failed-transfer");
        stakingVault.pushRewards(collateralName, wad);
        emit Join(wad);
    }

    function exit(address usr, uint256 wad) external {
        require(live == 1, "RewardJoin/not-live");
        stakingVault.pullRewards(collateralName, msg.sender, wad);
        require(collateralContract.transfer(usr, wad), "RewardJoin/failed-transfer");
        emit Exit(usr, wad);
    }
}

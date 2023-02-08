// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.12;

interface CollateralLike {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface StakingVaultLike {
    function pushStakingToken(address, uint256) external;
    function pullStakingToken(address, uint256) external;
}

/*
    Much like LMCV CollateralJoin except specific to staking tokens and StakingVault
*/
contract StakeJoin {
    
    // 
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "StakeJoin/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "StakeJoin/ArchAdmin cannot lose admin - update ArchAdmin to another address");
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
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Modifiers ---
    //

    modifier auth {
        require(wards[msg.sender] == 1, "StakeJoin/not-authorized");
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
        require(stakingVault_ != address(0) && collateralContract_ != address(0), "StakeJoin/Address cannot be zero");
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

    function join(address usr, uint256 wad) external {
        require(live == 1, "StakeJoin/not-live");
        require(collateralContract.transferFrom(msg.sender, address(this), wad), "StakeJoin/failed-transfer");
        stakingVault.pushStakingToken(usr, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        require(live == 1, "StakeJoin/not-live");
        stakingVault.pullStakingToken(msg.sender, wad);
        require(collateralContract.transfer(usr, wad), "StakeJoin/failed-transfer");
        emit Exit(usr, wad);
    }
}

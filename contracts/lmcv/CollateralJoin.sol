// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.12;

interface CollateralLike {
    function decimals() external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface LMCVLike {
    function pushCollateral(bytes32, address, uint256) external;
    function pullCollateral(bytes32, address, uint256) external;
}

/*
    CollateralJoin.sol -- Basic token adapter

    Here we provide *adapters* to connect the LMCV to arbitrary external
    token implementations, creating a bounded context for the LMCV. Some
    adapters are provided as working examples:

      - `CollateralJoin`: For well behaved ERC20 tokens, with simple transfer
                   semantics.

      - `dPrimeJoin`: For connecting internal Dai balances to an external
                   `DSToken` implementation.

    In practice, adapter implementations will be varied and specific to
    individual collateral types, accounting for different transfer
    semantics and token standards.

    Adapters need to implement two basic methods:

      - `join`: enter collateral into the system
      - `exit`: remove collateral from the system

*/
contract CollateralJoin {
    
    // 
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "CollateralJoin/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "CollateralJoin/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        wards[usr] = 0;
        emit Deny(usr);
    }

    //
    // --- Interfaces and data ---
    //

    LMCVLike        public immutable    lmcv; 
    CollateralLike  public immutable    collateralContract;
    bytes32         public immutable    collateralName; 
    address         public immutable    lmcvProxy;
    uint256         public              live;

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
        require(wards[msg.sender] == 1, "CollateralJoin/not-authorized");
        _;
    }

    modifier proxyContract {
        require(msg.sender == lmcvProxy, "CollateralJoin/Not proxy contract");
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

    constructor(address lmcv_, address lmcvProxy_, bytes32 collateralName_, address collateralContract_) {
        require(lmcv_ != address(0x0) && lmcvProxy_ != address(0x0) && collateralContract_ != address(0x0), "CollateralJoin/Can't be zero address");
        wards[msg.sender] = 1;
        ArchAdmin = msg.sender;
        live = 1;
        lmcv = LMCVLike(lmcv_);
        lmcvProxy = lmcvProxy_;
        collateralName = collateralName_;
        collateralContract = CollateralLike(collateralContract_);
        emit Rely(msg.sender);
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external {
        require(live == 1, "CollateralJoin/not-live");
        require(collateralContract.transferFrom(msg.sender, address(this), wad), "CollateralJoin/failed-transfer");
        lmcv.pushCollateral(collateralName, usr, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        require(live == 1, "CollateralJoin/not-live");
        lmcv.pullCollateral(collateralName, msg.sender, wad);
        require(collateralContract.transfer(usr, wad), "CollateralJoin/failed-transfer");
        emit Exit(usr, wad);
    }

    function proxyExit(address usr, uint256 wad) external proxyContract {
        require(live == 1, "CollateralJoin/not-live");
        lmcv.pullCollateral(collateralName, usr, wad);
        require(collateralContract.transfer(usr, wad), "CollateralJoin/failed-transfer");
        emit Exit(usr, wad);
    }
}

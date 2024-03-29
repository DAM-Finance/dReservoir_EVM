// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.7;

interface d2oJoinLike {
    function join(address user,uint256 wad) external;
    function exit(address user,uint256 wad) external;
    function d2o() external returns (address d2o);
}

interface LMCVLike {
    function d2o(address user) external returns (uint256);
    function loan(
        bytes32[] memory collats,           
        uint256[] memory collateralChange,  // [wad]
        uint256 d2oChange,               // [wad]
        address user
    ) external;
    function repay(
        bytes32[] memory collats, 
        uint256[] memory collateralChange, 
        uint256 d2oChange,
        address user
    ) external;
    function approve(address user) external;
    function disapprove(address user) external;
    function moveD2o(address src, address dst, uint256 rad) external;
}

interface d2oLike {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface CollateralJoinLike {
    function dec() external view returns (uint256);
    function lmcv() external view returns (address);
    function collateralName() external view returns (bytes32);
    function join(address, uint256, address) external;
    function exit(address, uint256) external;
}

/*

    Peg Stability Module.sol -- For using stablecoins as collateral without
    them being subject to the protocol level interest rate.

    Allows anyone to go between d2o and the Collateral by pooling stablecoins
    in this contract.

*/
contract PSM {

    //
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "PSM/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "PSM/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        wards[usr] = 0;
        emit Deny(usr);
    }
    
    //
    // --- Interfaces and data ---
    //

    LMCVLike            immutable public    lmcv;
    CollateralJoinLike  immutable public    collateralJoin;
    d2oLike             immutable public    d2o;
    d2oJoinLike         immutable public    d2oJoin;
    
    bytes32             immutable public    collateralName;
    address                       public    treasury;

    uint256             immutable internal  to18ConversionFactor;

    uint256                       public    mintFee;        //[ray]
    uint256                       public    repayFee;       //[ray]
    uint256                       public    live;

    //
    // --- Events ---
    //

    event MintRepayFee(uint256 MintRay, uint256 RepayRay);
    event Cage(uint256 status);
    event Rely(address user);
    event Deny(address user);

    //
    // --- Modifiers
    //

    modifier auth { 
        require(wards[msg.sender] == 1); 
        _; 
    }

    modifier alive {
        require(live == 1, "PSM/not-live");
        _;
    }

    //
    // --- Init ---
    //

    constructor(address collateralJoin_, address d2oJoin_, address treasury_) {
        require(collateralJoin_ != address(0x0) && d2oJoin_ != address(0x0) && treasury_ != address(0x0), "PSM/Can't be zero address");
        wards[msg.sender] = 1;
        live = 1;
        ArchAdmin = msg.sender;
        emit Rely(msg.sender);
        CollateralJoinLike collateralJoin__ = collateralJoin = CollateralJoinLike(collateralJoin_);
        d2oJoinLike d2oJoin__ = d2oJoin = d2oJoinLike(d2oJoin_);
        LMCVLike lmcv__ = lmcv = LMCVLike(address(collateralJoin__.lmcv()));
        d2oLike d2o__ = d2o = d2oLike(address(d2oJoin__.d2o()));
        collateralName = collateralJoin__.collateralName();
        treasury = treasury_;
        to18ConversionFactor = 10 ** (18 - collateralJoin__.dec());
        require(d2o__.approve(d2oJoin_, 2**256 - 1), "PSM/d2o approval failed");
        lmcv__.approve(d2oJoin_);
    }

    // 
    // --- Math ---
    //

    uint256 constant RAY = 10 ** 27;
    function _wadmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    //
    // --- Administration ---
    //

    function setMintRepayFees(uint256 mintRay, uint256 repayRay) external auth {
        require(mintRay < RAY && repayRay < RAY, "PSM/Fees must be less than 100%");
        mintFee = mintRay;
        repayFee = repayRay;
        emit MintRepayFee(mintRay, repayRay);
    }

    function setTreasury(address _treasury) external auth {
        require(_treasury != address(0x0), "PSM/Can't be zero address");
        treasury = _treasury;
    }


    function setLive(uint256 status) external auth {
        live = status;
        emit Cage(status);
    }

    function approve(address usr) external auth {
        lmcv.approve(usr);
    }

    function disapprove(address usr) external auth {
        lmcv.disapprove(usr);
    }

    //
    // --- User's functions ---
    //

    function createD2o(address usr, bytes32[] memory collateral, uint256[] memory collatAmount) external alive {
        require(collateral.length == 1 && collatAmount.length == 1 && collateral[0] == collateralName, "PSM/Incorrect setup");
        uint256 collatAmount18 = collatAmount[0] * to18ConversionFactor; // [wad]
        uint256 fee = _wadmul(collatAmount18, mintFee); // _wadmul(wad, ray) = wad
        uint256 d2oAmt = collatAmount18 - fee;

        collateralJoin.join(address(this), collatAmount[0], msg.sender);

        collatAmount[0] = collatAmount18;
        lmcv.loan(collateral, collatAmount, collatAmount18, address(this));
        lmcv.moveD2o(address(this), treasury, fee * RAY);

        d2oJoin.exit(usr, d2oAmt);
    }

    function getCollateral(address usr, bytes32[] memory collateral, uint256[] memory collatAmount) external alive {
        require(collateral.length == 1 && collatAmount.length == 1 && collateral[0] == collateralName, "PSM/Incorrect setup");
        uint256 collatAmount18 = collatAmount[0] * to18ConversionFactor;
        uint256 fee = _wadmul(collatAmount18, repayFee); // _wadmul(wad, ray) = wad
        uint256 d2oAmt = collatAmount18 + fee;

        require(d2o.transferFrom(msg.sender, address(this), d2oAmt), "PSM/d2o failed transfer");
        d2oJoin.join(address(this), d2oAmt);

        uint256 lowDecCollatAmount = collatAmount[0];
        collatAmount[0] = collatAmount18;
        lmcv.repay(collateral, collatAmount, collatAmount18, address(this));
        collateralJoin.exit(usr, lowDecCollatAmount);
        
        lmcv.moveD2o(address(this), treasury, fee * RAY);
    }

}
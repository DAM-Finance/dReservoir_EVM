// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.7;

import "hardhat/console.sol";

interface dPrimeJoinLike {
    function join(address user,uint256 wad) external;
    function exit(address user,uint256 wad) external;
    function dPrime() external returns (address dPrime);
}

interface LMCVLike {
    function dPrime(address user) external returns (uint256);
    function loan(
        bytes32[] memory collats,           
        uint256[] memory collateralChange,  // [wad]
        uint256 dPrimeChange,               // [wad]
        address user
    ) external;
    function repay(
        bytes32[] memory collats, 
        uint256[] memory collateralChange, 
        uint256 dPrimeChange,
        address user
    ) external;
    function approve(address user) external;
    function disapprove(address user) external;
    function moveDPrime(address src, address dst, uint256 rad) external;
}

interface dPrimeLike {
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

    Allows anyone to go between dPrime and the Collateral by pooling stablecoins
    in this contract.

*/
contract PSM {

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

    LMCVLike            immutable public    lmcv;
    CollateralJoinLike  immutable public    collateralJoin;
    dPrimeLike          immutable public    dPrime;
    dPrimeJoinLike      immutable public    dPrimeJoin;
    
    bytes32             immutable public    collateralName;
    address             immutable public    treasury;

    uint256             immutable internal  to18ConversionFactor;

    uint256                                 mintFee;        //[ray]
    uint256                                 repayFee;       //[ray]

    //
    // --- Events ---
    //

    event Rely(address user);
    event Deny(address user);
    event File(bytes32 indexed what, uint256 data);
    event CreateDPrime(address indexed owner, uint256 value, uint256 fee);
    event RemoveDPrime(address indexed owner, uint256 value, uint256 fee);

    //
    // --- Modifiers
    //

    modifier auth { 
        require(wards[msg.sender] == 1); 
        _; 
    }

    //
    // --- Init ---
    //

    constructor(address collateralJoin_, address dPrimeJoin_, address treasury_) {
        wards[msg.sender] = 1;
        emit Rely(msg.sender);
        CollateralJoinLike collateralJoin__ = collateralJoin = CollateralJoinLike(collateralJoin_);
        dPrimeJoinLike dPrimeJoin__ = dPrimeJoin = dPrimeJoinLike(dPrimeJoin_);
        LMCVLike lmcv__ = lmcv = LMCVLike(address(collateralJoin__.lmcv()));
        dPrimeLike dPrime__ = dPrime = dPrimeLike(address(dPrimeJoin__.dPrime()));
        collateralName = collateralJoin__.collateralName();
        treasury = treasury_;
        to18ConversionFactor = 10 ** (18 - collateralJoin__.dec());
        require(dPrime__.approve(dPrimeJoin_, 2**256 - 1), "PSM/dPrime approval failed");
        lmcv__.approve(dPrimeJoin_);
    }

    // 
    // --- Math ---
    //

    uint256 constant RAY = 10 ** 27;
    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    //
    // --- Administration ---
    //

    function setMintRepayFees(uint256 mintRay, uint256 repayRay) external auth {
        mintFee = mintRay;
        repayFee = repayRay;
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

    function createDPrime(address usr, bytes32[] memory collateral, uint256[] memory collatAmount) external {
        require(collateral.length == 1 && collatAmount.length == 1 && collateral[0] == collateralName, "PSM/Incorrect setup");
        uint256 collatAmount18 = collatAmount[0] * to18ConversionFactor; // [wad]
        uint256 fee = _rmul(collatAmount18, mintFee); // rmul(wad, ray) = wad
        uint256 dPrimeAmt = collatAmount18 - fee;

        collateralJoin.join(address(this), collatAmount[0], msg.sender);

        collatAmount[0] = collatAmount18;
        lmcv.loan(collateral, collatAmount, collatAmount18, address(this));
        lmcv.moveDPrime(address(this), treasury, fee * RAY);

        dPrimeJoin.exit(usr, dPrimeAmt);
        emit CreateDPrime(usr, collatAmount18, fee);
    }

    function getCollateral(address usr, bytes32[] memory collateral, uint256[] memory collatAmount) external {
        require(collateral.length == 1 && collatAmount.length == 1 && collateral[0] == collateralName, "PSM/Incorrect setup");
        uint256 collatAmount18 = collatAmount[0] * to18ConversionFactor;
        uint256 fee = _rmul(collatAmount18, repayFee); // rmul(wad, ray) = wad
        uint256 dPrimeAmt = collatAmount18 + fee;

        require(dPrime.transferFrom(msg.sender, address(this), dPrimeAmt), "PSM/dPrime failed transfer");
        dPrimeJoin.join(address(this), dPrimeAmt);

        uint256 lowDecCollatAmount = collatAmount[0];
        collatAmount[0] = collatAmount18;
        lmcv.repay(collateral, collatAmount, collatAmount18, address(this));
        collateralJoin.exit(usr, lowDecCollatAmount);
        
        lmcv.moveDPrime(address(this), treasury, fee * RAY);
        emit RemoveDPrime(usr, collatAmount18, fee);
    }

}
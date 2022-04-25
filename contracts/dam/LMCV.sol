// SPDX-License-Identifier: AGPL-3.0-or-later

/// LMCV.sol -- dPrime CDP database

pragma solidity 0.8.9;

contract LMCV {
    mapping(address => uint256) public admin;

    mapping(address => mapping (address => uint256))    public proxyApproval;

    struct CollateralType {
        uint256 spotPrice;
    }

    mapping (address => mapping (bytes32 => uint256))   public userCollateral;   // [wad]
    mapping (address => uint256)                        public userDPrimeDebt;   // [rad]
    mapping (address => bytes32[])                      public portfolioCollateralTokens;
    mapping (bytes32 => CollateralType)                 public collateralTypes;

    uint256 public live;
    uint256 public totalDebt;
    uint256 public DebtCeiling;


    // --- Events ---
    event ModifyCollateral(bytes32 indexed collat, address indexed user, int256 wad);
    event ModifyDPrime(address indexed src, address indexed dst, uint256 rad);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event MovePortfolio(address indexed src, address indexed dst);


    //Edit for types of auth 
    //- keep modules separate and only let their respective functions access them
    modifier auth() {
        require(admin[msg.sender] == 1, "LMCV/Not-Authorized");
        _;
    }

    modifier alive() {
        require(live == 1, "LMCV/paused");
        _;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApproval[bit][user] == 1);
    }

    constructor() {
        live = 1;
        admin[msg.sender] = 1;
    }

    // --- Allowance ---
    function proxyApprove(address user) external {
        proxyApproval[msg.sender][user] = 1;
    }

    function proxyDisapprove(address user) external {
        proxyApproval[msg.sender][user] = 0;
    }

    // --- Math ---
    function _add(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + uint256(y);
        }
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }

    function _sub(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x - uint256(y);
        }
        require(y <= 0 || z <= x);
        require(y >= 0 || z >= x);
    }

    
    // --- Fungibility ---
    //TODO: Test
    function modifyCollateral(bytes32 collat, address user, int256 wad) external auth {
        userCollateral[user][collat] = _add(userCollateral[user][collat], wad);
        emit ModifyCollateral(collat, user, wad);
    }

    //TODO: Test
    function modifyDPrime(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "LMCV/not-allowed");
        userDPrimeDebt[src] = userDPrimeDebt[src] - rad;
        userDPrimeDebt[dst] = userDPrimeDebt[dst] + rad;
        emit ModifyDPrime(src, dst, rad);
    }

    //TODO: Test
    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/not-allowed");
        userCollateral[src][collat] = userCollateral[src][collat] - wad;
        userCollateral[dst][collat] = userCollateral[dst][collat] + wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    //TODO: Test
    function movePortfolio(address src, address dst) external {
        require(approval(src, msg.sender), "LMCV/not-allowed");
        for(uint256 i = 0; i < portfolioCollateralTokens[src].length; i++){
            bytes32 collat = portfolioCollateralTokens[src][i];

            uint256 carryover = userCollateral[src][collat];
            userCollateral[src][collat] = 0;
            userCollateral[dst][collat] = userCollateral[dst][collat] + carryover;
        }
        emit MovePortfolio(src, dst);
    }

    //Like frob
    //All collaterals linked together to be more portfolio centric
    //eg: measure of whether a vault is safe or not is done based on
    //the vault as a whole being overcollateralized properly by weight
    function modifyCDP(
        bytes32[] memory collats, 
        address vaultUser, 
        address collateralGiver, 
        address dPrimeReceiver, 
        int256[] memory collateralChange, 
        int256 dPrimeChange
    ) external {
        // system is live
        require(live == 1, "Vat/not-live");


    }

    //Like grab
    //Will liquidate half of entire portfolio to regain healthy portfolio status
    //until the portfolio is too small to be split, in which case it liquidates
    //the entire portfolio - large accounts could liquidate many times
    function liquidate() external auth {

    }

    





    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

    function both(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := and(x, y)}
    }
}

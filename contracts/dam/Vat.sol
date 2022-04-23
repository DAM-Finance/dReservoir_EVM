// SPDX-License-Identifier: AGPL-3.0-or-later

/// vat.sol -- Dai CDP database

pragma solidity 0.8.9;

contract Vat {
    mapping(address => uint256) public wards;

    mapping(address => mapping (address => uint256)) public proxyApproval;

    mapping (bytes32 => mapping (address => uint))  public collateral;   // [wad]
    mapping (address => uint256)                    public dPrime;       // [rad]
    mapping (address => bytes32[])                  public portfolioCollateralTokens;

    uint256 public live;

    // --- Events ---
    event ModifyCollateral(bytes32 indexed collat, address indexed usr, int256 wad);
    event MoveStable(address indexed src, address indexed dst, uint256 rad);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event MovePortfolio(address indexed src, address indexed dst);


    //Edit for types of auth 
    //- keep modules separate and only let their respective functions access them
    modifier auth() {
        require(wards[msg.sender] == 1, "Vat/Not-Authorized");
        _;
    }

    modifier alive() {
        require(live == 1, "Vat/paused");
        _;
    }

    function approval(address bit, address usr) internal view returns (bool) {
        return either(bit == usr, proxyApproval[bit][usr] == 1);
    }

    constructor() {
        live = 1;
        wards[msg.sender] = 1;
    }

    // --- Allowance ---
    function proxyApprove(address usr) external {
        proxyApproval[msg.sender][usr] = 1;
    }

    function proxyDisapprove(address usr) external {
        proxyApproval[msg.sender][usr] = 0;
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
    function modifyCollateral(bytes32 collat, address usr, int256 wad) external auth {
        collateral[collat][usr] = _add(collateral[collat][usr], wad);
        emit ModifyCollateral(collat, usr, wad);
    }

    function moveStable(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "Vat/not-allowed");
        dPrime[src] = dPrime[src] - rad;
        dPrime[dst] = dPrime[dst] + rad;
        emit MoveStable(src, dst, rad);
    }

    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "Vat/not-allowed");
        collateral[collat][src] = collateral[collat][src] - wad;
        collateral[collat][dst] = collateral[collat][dst] + wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

//TODO: Test
    function movePortfolio(address src, address dst) external {
        require(approval(src, msg.sender), "Vat/not-allowed");
        for(uint256 i = 0; i < portfolioCollateralTokens[src].length; i++){
            bytes32 collat = portfolioCollateralTokens[src][i];

            uint256 carryover = collateral[collat][src];
            collateral[collat][src] = 0;
            collateral[collat][dst] = collateral[collat][dst] + carryover;
        }
        emit MovePortfolio(src, dst);
    }




    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

    function both(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := and(x, y)}
    }


}

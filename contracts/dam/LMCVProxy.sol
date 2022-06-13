// SPDX-License-Identifier: MIT

pragma solidity 0.8.14;

import "hardhat/console.sol";

interface ERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface CollateralJoinLike {
    function join(address user,uint256 wad) external;
    function exit(address user,uint256 wad) external;
}

interface dPrimeJoinLike {
    function join(address user,uint256 wad) external;
    function proxyExit(address user,uint256 wad) external;
}

interface LMCVLike {
    function pushDPrime(address src, uint256 rad) external;
    function pullDPrime(address src, uint256 rad) external;
    function loan(
        bytes32[] memory collats,           // [wad]
        uint256[] memory collateralChange,  // [wad]
        uint256 dPrimeChange,               // [wad]
        address user
    ) external;
}

contract LMCVProxy { 
    mapping(address => uint256) public wards;

    mapping (bytes32 => address)        public collateralContracts;
    mapping (bytes32 => address)        public collateralJoins;

    address public immutable lmcv;         // CDP Engine
    address public dPrimeJoin;
    uint256 public live;  // Active Flag
    uint256 constant RAY = 10 ** 27;
    uint256 constant MAX_INT = 2**256 - 1;

    // --- Events ---
    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event Cage();

    modifier auth {
        require(wards[msg.sender] == 1, "LMCVProxy/not-authorized");
        _;
    }

    modifier alive {
        require(live == 1, "LMCVProxy/not-live");
        _;
    }

    constructor(address _lmcv) {
        wards[msg.sender] = 1;
        live = 1;
        lmcv = _lmcv;
        emit Rely(msg.sender);
    }

    function setDPrimeJoin(address _dPrimeJoin) external auth {
        dPrimeJoin = _dPrimeJoin;
    }

    // --- Administration ---
    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    function cage() external auth {
        live = 0;
        emit Cage();
    }

    function editCollateral(bytes32 name, address collateralJoin, address collateralContract, uint256 amount) external auth alive {
        collateralContracts[name] = collateralContract;
        collateralJoins[name] = collateralJoin;
        ERC20Like(collateralContract).approve(collateralJoin, amount);
    }

    function beginLoan(bytes32[] memory collaterals, uint256[] memory amounts, uint256 wad) external alive {
        require(collaterals.length == amounts.length, "LMCVProxy/Not the same length");

        for(uint256 i = 0; i < collaterals.length; i++){
            ERC20Like(collateralContracts[collaterals[i]]).transferFrom(msg.sender, address(this), amounts[i]);
            CollateralJoinLike(collateralJoins[collaterals[i]]).join(msg.sender, amounts[i]);
        }
        LMCVLike(lmcv).loan(collaterals, amounts, wad, msg.sender);
        dPrimeJoinLike(dPrimeJoin).proxyExit(msg.sender, wad);
    }

}
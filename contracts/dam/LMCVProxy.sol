// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface ERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface CollateralJoinLike {
    function join(address user,uint256 wad) external;
    function proxyExit(address user,uint256 wad) external;
}

interface dPrimeJoinLike {
    function join(address user,uint256 wad) external;
    function proxyExit(address user,uint256 wad) external;
}

interface LMCVLike {
    function pushDPrime(address src, uint256 rad) external;
    function pullDPrime(address src, uint256 rad) external;
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
}

contract LMCVProxy { 
    mapping(address => uint256) public wards;

    mapping (bytes32 => address)        public collateralContracts;
    mapping (bytes32 => address)        public collateralJoins;

    address public lmcv;
    address public dPrimeJoin;
    address public dPrime;
    uint256 public live;

    // --- Events ---
    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event Cage(uint256 indexed status);

    modifier auth {
        require(wards[msg.sender] == 1, "LMCVProxy/not-authorized");
        _;
    }

    modifier alive {
        require(live == 1, "LMCVProxy/not-live");
        _;
    }

    constructor(address _lmcv) {
        require(_lmcv != address(0x0), "LMCVProxy/Can't be zero address");
        wards[msg.sender] = 1;
        live = 1;
        lmcv = _lmcv;
        emit Rely(msg.sender);
    }

    function setLMCV(address _lmcv) external auth {
        require(_lmcv != address(0x0), "LMCVProxy/Can't be zero address");
        lmcv = _lmcv;
    }

    function setDPrimeJoin(address _dPrimeJoin) external auth {
        require(_dPrimeJoin != address(0x0), "LMCVProxy/Can't be zero address");
        dPrimeJoin = _dPrimeJoin;
    }

    function setDPrime(address _dPrime) external auth {
        require(_dPrime != address(0x0), "LMCVProxy/Can't be zero address");
        dPrime = _dPrime;
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

    function setLive(uint256 status) external auth {
        live = status;
        emit Cage(status);
    }

    function editCollateral(bytes32 name, address collateralJoin, address collateralContract, uint256 amount) external auth alive {
        collateralContracts[name] = collateralContract;
        collateralJoins[name] = collateralJoin;
        require(ERC20Like(collateralContract).approve(collateralJoin, amount), "LMCVProxy/Approval failed");
    }

    function createLoan(bytes32[] memory collaterals, uint256[] memory amounts, uint256 wad) external alive {
        require(collaterals.length == amounts.length, "LMCVProxy/Not the same length");

        for(uint256 i = 0; i < collaterals.length; i++){
            require(ERC20Like(collateralContracts[collaterals[i]]).transferFrom(msg.sender, address(this), amounts[i]), "LMCVProxy/collateral transfer failed");
            CollateralJoinLike(collateralJoins[collaterals[i]]).join(msg.sender, amounts[i]);
        }
        LMCVLike(lmcv).loan(collaterals, amounts, wad, msg.sender);
        dPrimeJoinLike(dPrimeJoin).proxyExit(msg.sender, wad);
    }

    function repayLoan(bytes32[] memory collaterals, uint256[] memory amounts, uint256 wad) external alive {
        require(collaterals.length == amounts.length, "LMCVProxy/Not the same length");

        require(ERC20Like(dPrime).transferFrom(msg.sender, address(this), wad), "LMCVProxy/dPrime transfer failed");
        dPrimeJoinLike(dPrimeJoin).join(msg.sender, wad);
        LMCVLike(lmcv).repay(collaterals, amounts, wad, msg.sender);

        for(uint256 i = 0; i < collaterals.length; i++){
            CollateralJoinLike(collateralJoins[collaterals[i]]).proxyExit(msg.sender, amounts[i]);
        }
    }

}
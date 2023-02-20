// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

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

interface d2oJoinLike {
    function join(address user,uint256 wad) external;
    function proxyExit(address user,uint256 wad) external;
}

interface LMCVLike {
    function d2o(address user) external returns (uint256);
    function loan(
        bytes32[] calldata collats,           
        uint256[] calldata collateralChange,  // [wad]
        uint256 d2oChange,               // [wad]
        address user
    ) external;
    function repay(
        bytes32[] calldata collats, 
        uint256[] calldata collateralChange, 
        uint256 d2oChange,
        address user
    ) external;
}

contract LMCVProxy { 
    address public ArchAdmin;
    mapping(address => uint256) public wards;

    mapping (bytes32 => address)        public collateralContracts;
    mapping (bytes32 => address)        public collateralJoins;

    uint256 private constant RAY = 10 ** 27;
    address public lmcv;
    address public d2oJoin;
    address public d2o;
    uint256 public live;

    // --- Events ---
    event EditCollateral(bytes32 indexed name, address collateralJoin, address indexed collateralContract);
    event SetD2oJoin(address indexed d2oJoin);
    event SetD2o(address indexed d2o);
    event SetLMCV(address indexed lmcv);
    event Cage(uint256 indexed status);
    event Rely(address indexed usr);
    event Deny(address indexed usr);
    

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
        ArchAdmin = msg.sender;
        wards[msg.sender] = 1;
        live = 1;
        lmcv = _lmcv;
        emit Rely(msg.sender);
    }

    function setLMCV(address _lmcv) external auth {
        require(_lmcv != address(0x0), "LMCVProxy/Can't be zero address");
        lmcv = _lmcv;
        emit SetLMCV(lmcv);
    }

    function setD2oJoin(address _d2oJoin) external auth {
        require(_d2oJoin != address(0x0), "LMCVProxy/Can't be zero address");
        d2oJoin = _d2oJoin;
        emit SetD2oJoin(d2oJoin);
    }

    function setD2o(address _d2o) external auth {
        require(_d2o != address(0x0), "LMCVProxy/Can't be zero address");
        d2o = _d2o;
        emit SetD2o(d2o);
    }

    // --- Administration ---

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "LMCVProxy/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "LMCVProxy/ArchAdmin cannot lose admin - update ArchAdmin to another address");
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
        emit EditCollateral(name, collateralJoin, collateralContract);
    }

    function createLoan(bytes32[] calldata collaterals, uint256[] calldata amounts, uint256 wad) external alive {
        require(collaterals.length == amounts.length, "LMCVProxy/Not the same length");

        for(uint256 i = 0; i < collaterals.length; i++){
            require(ERC20Like(collateralContracts[collaterals[i]]).transferFrom(msg.sender, address(this), amounts[i]), "LMCVProxy/collateral transfer failed");
            CollateralJoinLike(collateralJoins[collaterals[i]]).join(msg.sender, amounts[i]);
        }
        LMCVLike(lmcv).loan(collaterals, amounts, wad, msg.sender);
        d2oJoinLike(d2oJoin).proxyExit(msg.sender, (LMCVLike(lmcv).d2o(msg.sender) / RAY));
    }

    function repayLoan(bytes32[] calldata collaterals, uint256[] calldata amounts, uint256 wad) external alive {
        require(collaterals.length == amounts.length, "LMCVProxy/Not the same length");

        require(ERC20Like(d2o).transferFrom(msg.sender, address(this), wad), "LMCVProxy/d2o transfer failed");
        d2oJoinLike(d2oJoin).join(msg.sender, wad);
        LMCVLike(lmcv).repay(collaterals, amounts, wad, msg.sender);

        for(uint256 i = 0; i < collaterals.length; i++){
            CollateralJoinLike(collateralJoins[collaterals[i]]).proxyExit(msg.sender, amounts[i]);
        }
    }

}
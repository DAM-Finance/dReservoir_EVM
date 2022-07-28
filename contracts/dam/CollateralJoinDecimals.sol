// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.7;

import "hardhat/console.sol";

interface CollateralLike {
    function decimals() external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface LMCVLike {
    function pushCollateral(bytes32, address, uint256) external;
    function pullCollateral(bytes32, address, uint256) external;
}

// Authed GemJoin for a token that has a lower precision than 18 and it has decimals (like USDC)

contract CollateralJoinDecimals {
    // --- Auth ---
    mapping (address => uint256) public wards;
    function rely(address usr) external auth { wards[usr] = 1; }
    function deny(address usr) external auth { wards[usr] = 0; }
    modifier auth { require(wards[msg.sender] == 1); _; }

    CollateralLike  public collateralContract;
    LMCVLike        public lmcv;
    address         public lmcvProxy;
    bytes32         public collateralName;
    uint256         public dec;
    uint256         public live;  // Access Flag
    

    constructor(address lmcv_, address _lmcvProxy, bytes32 collateralName_, address collateralContract_) {
        collateralContract = CollateralLike(collateralContract_);
        dec = collateralContract.decimals();
        require(dec < 18, "CollateralJoin/decimals cannot be higher than 17");
        wards[msg.sender] = 1;
        live = 1;
        lmcv = LMCVLike(lmcv_);
        collateralName = collateralName_;
        lmcvProxy = _lmcvProxy;
    }

    function cage() external auth {
        live = 0;
    }

    function join(address urn, uint256 wad, address _msgSender) external auth {
        require(live == 1, "CollateralJoin/not-live");
        uint256 wad18 = wad * (10 ** (18 - dec));
        lmcv.pushCollateral(collateralName, urn, wad18);
        require(collateralContract.transferFrom(_msgSender, address(this), wad), "CollateralJoin/failed-transfer");
    }

    function exit(address guy, uint256 wad) external {
        uint256 wad18 = wad * (10 ** (18 - dec));
        lmcv.pullCollateral(collateralName,  msg.sender, wad18);
        require(collateralContract.transfer(guy, wad), "CollateralJoin/failed-transfer");
    }
}
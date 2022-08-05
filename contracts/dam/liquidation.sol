// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function normalizedDebt(address) external view returns (uint256);
    function lockedCollateralListValues(address) external view returns (bytes32[] memory);
    function lockedCollateralList(address, uint256) external view returns (uint256);
    function lockedCollateral(address, bytes32) external view returns (uint256);
    function isWithinCreditLimit(address, uint256) external view returns (bool);
    function StabilityRate() external view returns (uint256);
    function Treasury() external view returns (address);
        function liquidate(
        uint256[] memory collateralChange,
        uint256 normalizedDebtChange,       
        address liquidated, 
        address liquidator) external;
}

interface AuctionHouseLike {
    function start(address user, address treasury, uint256 tab, uint256[] calldata collateralList, uint256 bid) external;
}

/*

    liquidation.sol -- facilitates liquidation of unhealhy vaults by
    seizing collateral and starting an auction process.

*/
contract Liquidator {

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

    LMCVLike            public immutable lmcv;          // CDP Engine
    AuctionHouseLike    public immutable auctionHouse;  // Auction house

    uint256             public lotSize;                 // [wad] The max auction lost size in dPRIME. 
    uint256             public liquidationPenalty;      // [wad] The max auction lost size in dPRIME. 
    uint256             public live;                    // Active flag.
    uint256             public outForAuction;           // Current amount of debt/collateral out for auction.

    //
    // --- Events ---
    //

    event Liquidated();
    event Rely(address user);
    event Deny(address user);

    //
    // --- Modifiers ---
    //

    modifier auth { 
        require(wards[msg.sender] == 1); 
        _; 
    }

    //
    // --- Initialization ---
    //

    constructor(address _lmcv, address _auctionHouse) {
        live = 1;
        wards[msg.sender] = 1;
        lmcv = LMCVLike(_lmcv);
        auctionHouse = AuctionHouseLike(_auctionHouse);
    }

    //
    // --- Admin ---
    //

    function cage() external auth {
        live = 0;
    }

    function setLiquidationPenalty(uint256 ray) external auth {
        liquidationPenalty = ray;
    }

    function setLotSize(uint256 rad) external auth {
        lotSize = rad;
    }

    //
    // --- Maths ---
    //

    uint256 constant RAY = 10 ** 27;
    uint256 constant WAD = 10 ** 18;


    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y == 0 || (z = x * y) / y == x);
    }

    function rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        if (x > y) { z = y; } else { z = x; }
    }

    //
    // --- User functions ---
    //

    /**
     * Anyone can call this function to liquidate a vault which is unhealthy.
     */
    function liquidate(address user) external {
        require(live == 1, "Liquidator/Not live");
        require(liquidationPenalty != 0 && lotSize != 0, "Liquidator/Not set up");
        require(!lmcv.isWithinCreditLimit(user, lmcv.StabilityRate()), "Liquidator/Vault within credit limit");

        // Grab the initial data we need from LMCV.
        uint256 normalizedDebt          = lmcv.normalizedDebt(user);                // [wad]
        uint256 stabilityRate           = lmcv.StabilityRate();                     // [ray]
        bytes32[] memory collateralList = lmcv.lockedCollateralListValues(user);
        uint256 collateralListLength    = collateralList.length;

        // We take the minimum of the normalized debt balance or the lot size devided by the stability rate 
        // and liquidation penalty. For small vaults, this means that the whole debt balance will be liquidated.
        // For larger vaults it means that only a portion of the vault will be liquidated.
        uint256 debtHaircut = min(normalizedDebt, lotSize * RAY / stabilityRate * RAY / liquidationPenalty);    // wad * RAY / ray * RAY / ray -> wad          
        require(debtHaircut > 0, "Liquidator/Debt haircut must be positive.");                                

        // Now we need to gather the information required to call liquidate on LMCV. Using the haircutPercentage
        // we can calculate how much of each collateral type to seize.
        uint256[] memory collateralHaircuts = new uint256[](collateralListLength);
        for(uint256 i = 0; i < collateralListLength; i++) {
            uint256 amount          = lmcv.lockedCollateral(user, collateralList[i]);
            collateralHaircuts[i]   = rmul(amount, debtHaircut * RAY / normalizedDebt); // wad * (wad * RAY / wad -> ray)
            require(collateralHaircuts[i] > 0, "Liquidator/Collateral haircut must be positive.");
        }

        // Liquidate the debt and collateral.
        lmcv.liquidate(collateralHaircuts, debtHaircut, user, address(this));

        // Start the auction. The asking amount takes into account any accrued interest and
        // the liquidation penalty.
        uint256 askingAmount = rmul(debtHaircut * stabilityRate, liquidationPenalty) / RAY;
        auctionHouse.start(user, lmcv.Treasury(), askingAmount, collateralHaircuts, 0);

        emit Liquidated();
    }
}

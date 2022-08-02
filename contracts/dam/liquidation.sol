// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function CollateralData(bytes32) external view returns (
        uint256 spotPrice,          // [ray] - dPrime (I.e. USD) price of collateral.   
        uint256 lockedAmount,       // [wad] - amount of collateral locked.
        uint256 lockedAmountLimit,  // [wad] - Protocol Level limit for amount of locked collateral.
        uint256 dustLevel,          // [wad] - Minimum amount of collateral allowed per vault.
        uint256 creditRatio,        // [ray] - ie. max 70% loaned out as dPrime.
        uint256 liqBonusMult,       // [ray] - ie. 5% for bluechip, 15% for junk
        bool    leveraged
    );
    function liquidate() external;
    function isWithinCreditLimit(address user, uint256 rate) external view returns (bool);
    function getCreditLimit(address user) external view returns (uint256 creditLimit, uint256 portfolioValue);
    function StabilityRate() external view returns (uint256);
}

interface AuctionHouseLike {
    function start() external;
}

/*

    liquidation.sol -- facilitates liquidation of unhealhy vaults by
    starting an auction process.

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

    uint256             public lotSize;                 // The max auction lost size in dPRIME. 
    uint256             public live;                    // Active flag.
    uint256             public outForAuction;           // Current amount of debt/collateral out for auction.

    //
    // --- Events ---
    //

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
        lmcv = LMCVLike(_lmcv);
        auctionHouse = AuctionHouseLike(_auctionHouse);
    }

    //
    // --- User functions ---
    //

    function liquidate(address user) external {
        (uint256 creditLimit, uint256 portfolioValue) = lmcv.getCreditLimit(user);
        console.log(creditLimit, portfolioValue);
        require(!lmcv.isWithinCreditLimit(user, lmcv.StabilityRate()), "Liquidator/Vault within credit limit");
    }

}


// ---- KEEP THIS FOR DESIGN PURPOSES UNTIL LIQUIDATION CONTRACT FINISHED
// //Old liquidation function
// //Will liquidate half of entire portfolio to regain healthy portfolio status
//     //until the portfolio is too small to be split, in which case it liquidates
//     //the entire portfolio - large accounts could liquidate many times'
//     //TODO: This will fail at some point when dPrime value is >100% of collateral because of overflow errors - update for that
//     function liquidate(
//         address liquidated, 
//         address liquidator, 
//         uint256 percentage // [ray]
//     ) external liqAlive {
//         uint256 totalValue = _getPortfolioValue(liquidated); // [rad]
//         uint256 dPrimeOwed = normalDebt[liquidated] * _getWeightedRate(liquidated);
//         require(!_isHealthy(liquidated), "LMCV/Vault is healthy");
        

//         //Check if beneath debtFloor or debt/loan > 81%
//         uint256 percentAllowed = partialLiqMax; // [ray]
//         uint256 valueRatio = dPrimeOwed 10**9 / totalValue; // [ray] TODO: THIS WILL OVERFLOW
        

//         // console.log("Insolvency percentage %s", valueRatio);
//         // console.log("Value x Partial %s", _rmul(debtDPrime[liquidated], partialLiqMax));
//         // console.log("Insolv > wholeCDP %s", valueRatio >= wholeCDPLiqMult);
//         // console.log("First condition:  %s", _rmul(debtDPrime[liquidated], partialLiqMax) < liquidiationFloor );
//         // console.log("Second condition:  %s", valueRatio > wholeCDPLiqMult);
//         if( _rmul(dPrimeOwed, partialLiqMax) < liquidiationFloor || valueRatio >= wholeCDPLiqMult){
//             percentAllowed = RAY; //100% of dPrime value from collateral
//         }
//         if(percentage > percentAllowed){
//             percentage = percentAllowed;
//         }

//         //take dPrime from liquidator
//         uint256 repaymentValue = _rmul(debtDPrime[liquidated], percentage); // [rad]
//         //This requirement not needed because of overflow math but leaving it in on purpose for clarity to the user
//         require(liqDPrime[liquidator] >= repaymentValue, "LMCV/Not enough liquidation dPrime available");
//         liqDPrime[liquidator] -= repaymentValue;

//         // Move collateral to liquidator's address
//         for(uint256 i = 0; i < lockedCollateralList[liquidated].length; i++){
//             bytes32 collateral = lockedCollateralList[liquidated][i];
//             uint256 lockedAmount = lockedCollateral[liquidated][collateral]; // [wad]
//             uint256 liquidateableAmount = _rmul(lockedAmount, valueRatio); // wad,ray -> wad
//             uint256 liquidationAmount =  _rmul(liquidateableAmount,(percentage + (_rmul(percentage, CollateralTypes[collateral].liqBonusMult)))); // wad,ray -> wad

//             // console.log("\n Collateral: %s", bytes32ToString(collateral));
//             // console.log("liquidationAmount   %s", liquidationAmount);
//             if(liquidationAmount > lockedAmount){
//                 CollateralTypes[collateral].totalDebt -= lockedAmount;
//                 lockedCollateral[liquidated][collateral] = 0;
//                 unlockedCollateral[liquidator][collateral] += lockedAmount;
//             }else{
//                 CollateralTypes[collateral].totalDebt -= liquidationAmount;
//                 lockedAmount -= liquidationAmount;
//                 lockedCollateral[liquidated][collateral] = lockedAmount;
//                 unlockedCollateral[liquidator][collateral] += liquidationAmount;
//             }
//         }

//         //take fee
//         uint256 protocolLiqFee = valueRatio >= protocolFeeRemovalMult ? 0 : _rmul(repaymentValue, protocolLiqFeeMult);
//         repaymentValue -= protocolLiqFee;
//         debtDPrime[feeTaker] += protocolLiqFee;

//         //remove debt from protocol
//         ProtocolDebt -= repaymentValue;

//         //repay liquidated's debt
//         debtDPrime[liquidated] -= repaymentValue;
//         //TODO: What makes the most sense? Amount of dPrime withdrawn is subtracted by the liquidated amount? TESTTTTTTTTTT
//         withdrawnDPrime[liquidated] <= repaymentValue ? withdrawnDPrime[liquidated] = 0 : withdrawnDPrime[liquidated] -= repaymentValue;
//         emit Liquidation(liquidated, liquidator, percentage);
//     }

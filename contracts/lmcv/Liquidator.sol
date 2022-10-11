// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    // Properties.
    function normalizedDebt(address) external view returns (uint256);
    function lockedCollateralListValues(address) external view returns (bytes32[] memory);
    function lockedCollateral(address, bytes32) external view returns (uint256);
    function CollateralData(bytes32) external view returns (
        uint256 spotPrice,
        uint256 lockedAmount,
        uint256 lockedAmountLimit,
        uint256 dustLevel,
        uint256 creditRatio,           
        bool leveraged
    );
    function AccumulatedRate() external view returns (uint256);
    function Treasury() external view returns (address);
    // Methods.
    function isWithinCreditLimit(address, uint256) external view returns (bool);
    function seize(
        bytes32[] calldata collateralList,
        uint256[] calldata collateralHaircuts,
        uint256 debtHaircut,       
        address liquidated, 
        address liquidator,
        address treasury
    ) external;
    function approve(address) external;
    function disapprove(address) external;
}

interface AuctionHouseLike {
    function start(
        address user, 
        address treasury, 
        uint256 debtHaircut, 
        bytes32[] calldata lotList,
        uint256[] calldata lotHaircuts,
        uint256 bid,
        uint256 minBid
    ) external returns (uint256);
}

/*

    liquidation.sol -- facilitates liquidation of unhealhy vaults by
    seizing collateral and starting an auction process.

*/
contract Liquidator {

    //
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "Liquidator/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "Liquidator/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        wards[usr] = 0;
        emit Deny(usr);
    }

    //
    // --- Interfaces and data ---
    //

    LMCVLike            public immutable lmcv;                      // CDP Engine
    AuctionHouseLike    public auctionHouse;                        // Auction house

    uint256             public lotSize;                             // [wad] The max auction lot size in normalized debt terms. If vault is _just_ smaller than lotSize, then debtHaircut will be larger than lotSize when liquidation premium and accrued interest added.
    uint256             public collateralFactor         = 0.5E27;   // [rad] Minimum bid must be greater than this multiple of total lot value, when using lot value as the basis for minimum bid amount.
    uint256             public debtFactor               = 0.8E27;   // [rad] Minimum bid must be greater than this multiple of askingAmount, when using askingAmount as the basis for minimum bid amount.
    uint256             public debtGrossUpFactor        = 1.2E27;   // [rad] Factor to multiply askingAmount by to ensure there is a sufficient collateral buffer when choosing to take the minimum bid amount as a percentage of askingAmount.
    uint256             public liquidationPenalty;                  // [ray] Debt haircut "gross-up" percentage. 
    uint256             public live;                                // Active flag.

    //
    // --- Events ---
    //

    event Liquidated(
        bytes32[] collateralList, 
        uint256[] collateralHaircuts, 
        address liquidated, 
        uint256 debtHaircut, 
        uint256 askingAmount,
        uint256 auctionId
    );
    event SetMinimumAskingPriceVariables(
        uint256 _collateralFactor, 
        uint256 _debtFactor, 
        uint256 _debtGrossUpFactor
    );
    event SetLiquidationPenalty(uint256 ray);
    event SetAuctionHouse(address addr);
    event SetLotSize(uint256 rad);
    event Cage(uint256 status);
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

    constructor(address _lmcv) {
        live = 1;
        wards[msg.sender] = 1;
        ArchAdmin = msg.sender;
        lmcv = LMCVLike(_lmcv);
    }

    //
    // --- Admin ---
    //

    function cage(uint256 status) external auth {
        live = status;
        emit Cage(status);
    }

    function setLiquidationPenalty(uint256 ray) external auth {
        liquidationPenalty = ray;
        emit SetLiquidationPenalty(ray);
    }

    function setLotSize(uint256 rad) external auth {
        require(rad != 0, "Liquidator/Lot size cannot be 0");
        lotSize = rad;
        emit SetLotSize(rad);
    }

    /**
     * Makes sense to set all these three parameters at the same time as they are all closely related.
     */
    function setMinimumAskingPriceVariables(
        uint256 _collateralFactor,           // [ray]
        uint256 _debtFactor,                 // [ray]
        uint256 _debtGrossUpFactor           // [ray]
    ) external auth {       
        collateralFactor    = _collateralFactor;
        debtFactor          = _debtFactor;
        debtGrossUpFactor   = _debtGrossUpFactor;
        emit SetMinimumAskingPriceVariables(_collateralFactor, _debtFactor, _debtGrossUpFactor);
    }

    function setAuctionHouse(address addr) external auth {
        require(addr != address(0), "Liquidator/Address cannot be zero");
        lmcv.disapprove(address(auctionHouse));
        auctionHouse = AuctionHouseLike(addr);
        lmcv.approve(addr);
        emit SetAuctionHouse(addr);
    }

    //
    // --- Maths ---
    //

    uint256 constant RAY = 10 ** 27;

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
        require(!lmcv.isWithinCreditLimit(user, lmcv.AccumulatedRate()), "Liquidator/Vault within credit limit");

        // Grab the initial data we need from LMCV.
        uint256 normalizedDebt          = lmcv.normalizedDebt(user);                // [wad]
        uint256 stabilityRate           = lmcv.AccumulatedRate();                   // [ray]
        bytes32[] memory collateralList = lmcv.lockedCollateralListValues(user);
        uint256 collateralListLength    = collateralList.length;

        // We take the minimum of the normalized debt balance or the lot size divided by the stability rate 
        // and liquidation penalty. For small vaults, this means that the whole debt balance will be liquidated.
        // For larger vaults it means that only a portion of the vault will be liquidated.
        uint256 debtHaircut = min(normalizedDebt, lotSize * RAY / stabilityRate * RAY / liquidationPenalty);    // wad * RAY / ray * RAY / ray -> wad          
        require(debtHaircut > 0, "Liquidator/Debt haircut must be positive.");                     

        // We want to ensure that we never end up with an auction with a single bidder where they walk off with all the collateral
        // having only submitted a token bid. To do this, we will encourage auction participants or participate ourselves. However,
        // as a failsafe, we can set a minimum bid as a percentage of the collateral up for auction or the debt to be liquidated. 
        // E.g. if the debtHaircut is 200 and the collateraHaircut is 280 in dPRIME terms, then with a 50% `collateralFactor`, we 
        // set the minimum bid to 140, meaning that in order for the auction to conclude, it must raise _at least_ 140 dPRIME. 
        // Whilst this still results in a loss to the protocol, the loss is half of what it would have been if no minimum bid was 
        // set. Note that if the `collateralFactor` or `debtFactor` is set to zero, then the minimum bid is effectively zero, 
        // which is a valid value.
        uint256 liquidatedCollateralValue = 0;    

        // Now we need to gather the information required to call liquidate on LMCV. Using the haircutPercentage
        // we can calculate how much of each collateral type to seize.
        uint256[] memory collateralHaircuts = new uint256[](collateralListLength);
        for(uint256 i = 0; i < collateralListLength; i++) {
            uint256 amount          = lmcv.lockedCollateral(user, collateralList[i]);
            collateralHaircuts[i]   = rmul(amount, debtHaircut * RAY / normalizedDebt); // wad * (wad * RAY / wad -> ray)
            require(collateralHaircuts[i] > 0, "Liquidator/Collateral haircut must be positive.");

            // For calculating the minBid we must know the aggregate value of the collateral haircuts.
            (uint256 spotPrice,,,,,) = lmcv.CollateralData(collateralList[i]);
            liquidatedCollateralValue += rmul(collateralHaircuts[i], spotPrice);
        }

        // Seize the collateral and mark the outstanding debt as a potential protocol deficit.
        lmcv.seize(collateralList, collateralHaircuts, debtHaircut, user, address(this), lmcv.Treasury());

        // Calculate the asking amount which includes the accrued interest and liquidation penalty.
        uint256 askingAmount = rmul(debtHaircut * stabilityRate, liquidationPenalty);

        // If the asking amount is somewhat less than the liquidated collateral value then the minimum bid can typically 
        // be a percentage of the askingAmount. In most cases we would expect that the liquidated collateral value 
        // safely covers the askingAmount by some margin but there could be situations where it only _just_ covers it
        // and this could lead to an auction with a minimum bid amount which is too high and no-one bids. To avoid this, 
        // when deciding the minimum bid amount, we gross up the askingAmount by some factor to ensure that we only take 
        // the minimum bid amount as a percentage of the asking amount if the auction lot is sufficiently over-collateralised.
        // Otherwise we take the minimum bid as a percentage of the liquidated collateral value. This would be done when
        // the vault is under-collateralised and setting the minimum bid amount as a percentage of askingPrice may likely
        // end up with a value which is greater than the value of the collateral for sale.
        // TODO: Double check the maths here.
        uint256 minimumBid = 0;
        if (rmul(askingAmount, debtGrossUpFactor) / RAY < liquidatedCollateralValue) {
            minimumBid = rmul(askingAmount, debtFactor);
        } else {
            minimumBid = liquidatedCollateralValue * collateralFactor;
        }

        // Start the auction. The asking amount takes into account any accrued interest and the liquidation penalty.
        uint256 id = auctionHouse.start(
            user,                       // Liquidated user address
            lmcv.Treasury(),            // Treasury address
            askingAmount,               // dPRIME amount to raise including liquidation penalty
            collateralList,             // List of collateral types up for auction
            collateralHaircuts,         // List of collateral amounts up for auction - order matters
            0,                          // Initial bid is always zero
            minimumBid                  // Minimum bid amount in dPRIME
        );   

        emit Liquidated(collateralList, collateralHaircuts, user, debtHaircut, askingAmount, id);
    }
}

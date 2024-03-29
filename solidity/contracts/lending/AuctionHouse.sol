// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function moveD2o(address src, address dst, uint256 rad) external;
    function moveCollateral(bytes32 collateral, address src, address dst, uint256 wad) external;
}

contract AuctionHouse {

    //
    // --- Auth ---
    //

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "AuctionHouse/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "AuctionHouse/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        wards[usr] = 0;
        emit Deny(usr);
    }

    //
    // --- Interfaces and data ---
    //

    struct Auction {
        bytes32[]   lotList;            // Collateral types being liquidated
        uint256[]   lotValues;          // collateral amount up for auction             [wad]
        uint256     askingAmount;       // Target d2o amount                         [rad]

        uint256     debtBid;            // Highest d2o paid                          [rad]
        uint256     collateralBid;      // Percentage of collateral in return for bid   [ray]
        uint256     minBid;             // Debt bids must be above this minimum amount  [rad]

        uint256     bidExpiry;          //                                              [unix epoch time]
        uint256     auctionExpiry;      //                                              [unix epoch time]
        
        address     currentWinner;      // Highest bidder                               
        address     liquidated;         // Liquidated user
        address     treasury;           // Treasury address
    }

    mapping (uint256 => Auction)    public              auctions;

    LMCVLike                        public immutable    lmcv;                           // LMCV.
    uint256                         public              live;                           // Active flag
    uint256                         public              minimumBidIncrease  = 1.05E27;  // 5% minimum debt bid increase
    uint256                         public              minimumBidDecrease  = 0.95E27;  // 5% minimum collateral bid decrease
    uint256                         public              bidExpiry           = 3 hours;  // 3 hours bid duration         [seconds]
    uint256                         public              auctionExpiry       = 2 days;   // 2 days total auction length  [seconds]
    uint256                         public              auctionId           = 0;        // Monotonic auction ID

    //
    // --- Events ---
    //

    event Cage(uint256 status);
    event Rely(address user);
    event Deny(address user);
    event SetMinimumDebtBidIncrease(uint256 rad);
    event SetMinimumCollateralBidDecrease(uint256 ray);
    event SetBidExpiry(uint256 mins);
    event SetAuctionExpiry(uint256 hrs);

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
        ArchAdmin = msg.sender;
        live = 1;
        wards[msg.sender] = 1;
        lmcv = LMCVLike(_lmcv);
    }

    //
    // --- Admin ---
    //

    function cage(uint256 status) external auth {
        live = status;
        emit Cage(status);
    }

    function setMinimumDebtBidIncrease(uint256 rad) external auth {
        minimumBidIncrease = rad;
        emit SetMinimumDebtBidIncrease(rad);
    }

    function setMinimumCollateralBidDecrease(uint256 ray) external auth {
        minimumBidDecrease = ray;
        emit SetMinimumCollateralBidDecrease(ray);
    }

    function setBidExpiry(uint256 mins) external auth {
        bidExpiry = 60 * mins;
        emit SetBidExpiry(mins);
    }

    function setAuctionExpiry(uint256 hrs) external auth {
        auctionExpiry = 60 * 60 * hrs;
        emit SetAuctionExpiry(hrs);
    }

    //
    // -- Maths ---
    //
    
    uint256 constant RAY = 10 ** 27;
    uint256 constant WAD = 10 ** 18;
    // Can only be used sensibly with the following combination of units:
    // - `_radmul(ray, ray) -> ray`
    // - `_radmul(rad, ray) -> rad`
    function _radmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        x = x / WAD;
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY * WAD;
    }

    // Can only be used sensibly with the following combination of units:
    // - `_wadmul(wad, ray) -> wad`
    function _wadmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    //
    // --- User functions ---
    //

    /**
     * Starts off a new auction. Increments the auction ID, creates a new auction struct
     * and moves all the collateral to the auction house's account. Bids start at zero.
     */
    function start(
        address user, 
        address treasury, 
        uint256 askingAmount, 
        bytes32[] calldata lotList, 
        uint256[] calldata lotValues, 
        uint256 debtBid,
        uint256 minBid
    ) external auth returns (uint256 id) {
        require(live == 1, "AuctionHouse/Not live");
        // Return the current ID and increment.
        id = ++auctionId;

        // Set up struct for this auction.
        auctions[id].lotList        = lotList;
        auctions[id].lotValues      = lotValues;
        auctions[id].collateralBid  = RAY;
        auctions[id].debtBid        = debtBid;
        auctions[id].currentWinner  = msg.sender;
        auctions[id].auctionExpiry  = uint256(block.timestamp) + auctionExpiry;
        auctions[id].liquidated     = user;
        auctions[id].treasury       = treasury;
        auctions[id].askingAmount   = askingAmount;
        auctions[id].minBid         = minBid;

        // For each collateral type, move collateral from liquidator to AuctionHouse.
        for(uint256 i = 0; i < lotList.length; i++) {
            lmcv.moveCollateral(lotList[i], msg.sender, address(this), lotValues[i]);
        }
    }

    /**
     * In this stage of the auction, users bid for how much of the debt they want to buy. In most cases, given
     * that there is a potentially high discount available for the underlying collateral we would expect most 
     * auctions to achieve bids equal to the asking amount. However there are some circumstances where this may
     * not happen, where the collateral value is less than the debt value, for instance. In that case, no-one
     * bidding on the auction is going to bid more than the collateral value less some amount of profit. Therefore,
     * it would be expected that the highest bid will be lower than the asking amount.
     */
    function raise(uint256 id, uint256 bid) external {
        require(live == 1, "AuctionHouse/Not live");
        // The liquidator contract is always the highest bidder for a new, valid auction.
        require(auctions[id].currentWinner != address(0), "AuctionHouse/Highest bidder not set");
        // No bids after bid expiry time, which by default is 3 hours after a bid is placed.
        require(auctions[id].bidExpiry > block.timestamp || auctions[id].bidExpiry == 0, "AuctionHouse/Bid expiry reached");
        // Bids can't be placed when the auction has ended.
        require(auctions[id].auctionExpiry > block.timestamp, "AuctionHouse/Auction ended");
        // No bids higher than the asking amount.
        require(bid <= auctions[id].askingAmount, "AuctionHouse/Bid higher than asking amount");
        // New bid must be higher than old bid!
        require(bid > auctions[id].debtBid, "AuctionHouse/Bid must be higher than current highest bid");
        // Bid must increase by the minimum amount or be the asking amount.
        require(bid * RAY >= minimumBidIncrease * auctions[id].debtBid || bid == auctions[id].askingAmount, "AuctionHouse/Insufficient increase");
        // Bid must be greater than the minimum bid.
        require(bid >= auctions[id].minBid, "AuctionHouse/Bid lower than minimum bid");
        
        // Refund the previous highest bidder if there was one and move the increased amount to
        // the treasury. For the first bid, "debtBid" will be zero, so no d2o is moved to the
        // liquidator contract and the whole bid amount is moved from the bidder to the treasury.
        if (msg.sender != auctions[id].currentWinner) {
            lmcv.moveD2o(msg.sender, auctions[id].currentWinner, auctions[id].debtBid);
            auctions[id].currentWinner = msg.sender;
        }
        lmcv.moveD2o(msg.sender, auctions[id].treasury, bid - auctions[id].debtBid);

        auctions[id].debtBid = bid;
        auctions[id].bidExpiry = uint256(block.timestamp) + bidExpiry;
    }

    /**
     * In this stage of the auction, participants compete on how much collateral they are willing to accept
     * for a fixed amount of d2o. To do this they submit decreasing bids to the auction. Each bid represents
     * the percentage of collateral which the auction user is willing to receive in return for the fixed d2o
     * amount, e.g. a bid of 0.80 means the user is willing to accept 80% of the collatera lup for auction in 
     * return for the fixed d2o price, meaning that 20% of the collateral goes back to the liquidated vault
     * user.
     */
    function converge(uint256 id, uint256 collateralBid) external {
        require(live == 1, "AuctionHouse/Not live");
        // The liquidator contract is always the highest bidder for a new, valid auction.
        require(auctions[id].currentWinner != address(0), "AuctionHouse/Highest bidder not set");
        // No bids after bid expiry time, which by default is 3 hours after a bid is placed.
        require(auctions[id].bidExpiry > block.timestamp || auctions[id].bidExpiry == 0, "AuctionHouse/Bid expiry reached");
        // Bids can't be placed when the auction has ended.
        require(auctions[id].auctionExpiry > block.timestamp, "AuctionHouse/Auction ended");
        // This stage can only start once stage one has finished.
        require(auctions[id].debtBid == auctions[id].askingAmount, "AuctionHouse/First phase not finished");
        // New lot bids must be lower than the current lot bid.
        require(collateralBid < auctions[id].collateralBid, "AuctionHouse/collateralBid not lower");
        // New lot bids must be lower than the minimum decrease.
        require(collateralBid <= _radmul(minimumBidDecrease, auctions[id].collateralBid), "AuctionHouse/Insufficient decrease");

        // Return collateral to the user - difference between last collateralBid and current collateralBid.
        for(uint256 i = 0; i < auctions[id].lotList.length; i++) {
            uint256 portionToReturn = _wadmul(auctions[id].lotValues[i], (auctions[id].collateralBid - collateralBid)); 
            lmcv.moveCollateral(auctions[id].lotList[i], address(this), auctions[id].liquidated, portionToReturn);
        }

        auctions[id].collateralBid = collateralBid;
        auctions[id].bidExpiry = uint256(block.timestamp) + bidExpiry;

        // The lowest bidder at this stage, if not the highest bidder in the first stage has to move the
        // amount of d2o decided in the first stage to the prior highest bidder.
        if (msg.sender != auctions[id].currentWinner) {
            lmcv.moveD2o(msg.sender, auctions[id].currentWinner, auctions[id].debtBid);
            auctions[id].currentWinner = msg.sender;
        }
    }

    /**
     * The auction ends when at least one bid has been placed in stage one and either the auction or bid
     * expiry times have been reached. Once an auction has been concluded, its data is removed from the 
     * mapping.
     */
    function end(uint256 id) external {
        require(live == 1, "AuctionHouse/Not live");
        // The auction ends after the last bid and auction expiry is reached.
        require(
            auctions[id].bidExpiry != 0 && (auctions[id].bidExpiry < block.timestamp || auctions[id].auctionExpiry < block.timestamp), 
            "AuctionHouse/Auction not finished"
        );

        // The highest bidder gets whatever collateral is left over after stage two of the auction.
        for(uint256 i = 0; i < auctions[id].lotList.length; i++) {
            uint256 remainingCollateral = _wadmul(auctions[id].lotValues[i], auctions[id].collateralBid);
            lmcv.moveCollateral(auctions[id].lotList[i], address(this), auctions[id].currentWinner, remainingCollateral);
        }
        delete auctions[id];
    }

    /**
     * Allows an auction to be restarted if it has ended and there have been no bids.
     */
    function restart(uint256 id) external auth {
        require(auctions[id].auctionExpiry < block.timestamp, "AuctionHouse/Auction not finished");
        // Bid expiry is only set if a bid is placed.
        require(auctions[id].bidExpiry == 0, "AuctionHouse/Bid already placed");
        auctions[id].auctionExpiry = uint256(block.timestamp) + auctionExpiry;
    }

    //
    // -- Testing ---
    //

    /**
     * Getter for the types and amounts of collateral up for auction.
     */
    function lot(uint256 id) external view returns (bytes32[] memory, uint256[] memory) {
        return (auctions[id].lotList, auctions[id].lotValues);
    }
}

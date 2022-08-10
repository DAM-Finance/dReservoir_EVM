// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function moveDPrime(address src, address dst, uint256 rad) external;
    function moveCollateral(bytes32 collateral, address src, address dst, uint256 wad) external;
}

contract AuctionHouse {

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

    struct Bid {
        bytes32[]   lotList;            // Collateral types being liquidated
        uint256[]   lotValues;          // collateral amount up for auction     [wad]
        uint256     askingAmount;       // Target dPRIME amount                 [rad]
        uint256     highestBid;         // Highest dPRIME paid                  [rad]
        address     highestBidder;      // Highest bidder
        uint256     bidExpiry;          //                                      [unix epoch time]
        uint256     auctionExpiry;      //                                      [unix epoch time]
        address     liquidated;         // Liquidated user
        address     treasury;           // Treasury address
    }

    mapping (uint256 => Bid)    public              auctions;

    LMCVLike                    public immutable    lmcv;                           // LMCV.
    uint256                     public              live;                           // Active flag
    uint256                     public              minimumBidIncrease  = 1.05E18;  // 5% minimum bid increase
    uint256                     public              bidExpiry           = 3 hours;  // 3 hours bid duration         [seconds]
    uint256                     public              auctionExpiry       = 2 days;   // 2 days total auction length  [seconds]
    uint256                     public              auctionId           = 0;        // Monotonic auction ID

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

    constructor(address _lmcv) {
        live = 1;
        wards[msg.sender] = 1;
        lmcv = LMCVLike(_lmcv);
    }

    //
    // --- Admin ---
    //

    function cage() external auth {
        live = 0;
    }

    function setMinimumBidIncrease(uint256 rad) external auth {
        minimumBidIncrease = rad;
    }

    function setBidExpiry(uint256 mins) external auth {
        bidExpiry = 60 * mins;
    }

    function setAuctionExpiry(uint256 hrs) external auth {
        auctionExpiry = 60 * 60 * hrs;
    }

    //
    // -- Maths ---
    //
    
    uint256 constant WAD = 1.00E18;

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
        uint256 highestBid
    ) external auth returns (uint256 id) {
        // Return the current ID and increment.
        id = ++auctionId;

        // Set up struct for this auction.
        auctions[id].lotList        = lotList;
        auctions[id].lotValues      = lotValues;
        auctions[id].highestBid     = highestBid;
        auctions[id].highestBidder  = msg.sender;
        auctions[id].auctionExpiry  = uint256(block.timestamp) + auctionExpiry;
        auctions[id].liquidated     = user;
        auctions[id].treasury       = treasury;
        auctions[id].askingAmount   = askingAmount;

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
    function stageOneBid(uint256 id, uint256 bid) external {
        // The liquidator contract is always the highest bidder for a new, valid auction.
        require(auctions[id].highestBidder != address(0), "AuctionHouse/Highest bidder not set");
        // No bids after bid expiry time, which by default is 3 hours after a bid is placed.
        require(auctions[id].bidExpiry > block.timestamp || auctions[id].bidExpiry == 0, "AuctionHouse/Bid expiry reached");
        // Bids can't be placed when the auction has ended.
        require(auctions[id].auctionExpiry > block.timestamp, "AuctionHouse/Auction ended");
        // No bids higher than the asking amount.
        require(bid <= auctions[id].askingAmount, "AuctionHouse/Bid higher than asking amount");
        // New bid must be higher than old bid!
        require(bid > auctions[id].highestBid, "AuctionHouse/Bid must be higher than current highest bid");
        // Bid must increase by the minimum amount or be the asking amount.
        require(bid * WAD >= minimumBidIncrease * auctions[id].highestBid || bid == auctions[id].askingAmount, "AuctionHouse/Insufficient increase");
        
        // Refund the previous highest bidder if there was one and move the increased amount to
        // the treasury. For the first bid, "highestBid" will be zero, so no DPrime is moved to the
        // liquidator contract and the whole bid amount is moved from the bidder to the treasury.
        if (msg.sender != auctions[id].highestBidder) {
            lmcv.moveDPrime(msg.sender, auctions[id].highestBidder, auctions[id].highestBid);
            auctions[id].highestBidder = msg.sender;
        }
        lmcv.moveDPrime(msg.sender, auctions[id].treasury, bid - auctions[id].highestBid);

        auctions[id].highestBid = bid;
        auctions[id].bidExpiry = uint256(block.timestamp) + bidExpiry;
    }

    function stageTwoBid() external {
        // TODO.
    }

    /**
     * The auction ends when at least one bid has been placed in stage one and either the auction or bid
     * expiry times have been reached. Once an auction has been concluded, its data is removed from the 
     * mapping.
     */
    function end(uint256 id) external {
        // The auction ends after the last bid and auction expiry is reached.
        require(auctions[id].bidExpiry != 0 && (auctions[id].bidExpiry < block.timestamp || auctions[id].auctionExpiry < block.timestamp), "AuctionHouse/Auction not finished");
        // The highest bidder gets whatever collateral is left over after stage two of the auction.
        for(uint256 i = 0; i < auctions[id].lotList.length; i++) {
            lmcv.moveCollateral(auctions[id].lotList[i], address(this), auctions[id].highestBidder, auctions[id].lotValues[i]);
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

    /**
     * Getter for the types and amounts of collateral up for auction.
     */
    function lot(uint256 id) external view returns (bytes32[] memory, uint256[] memory) {
        return (auctions[id].lotList, auctions[id].lotValues);
    }
}
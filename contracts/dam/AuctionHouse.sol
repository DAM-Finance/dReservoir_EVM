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

    // TODO: Rename some of these properties as currently they are confusing given the two stage nature of
    // the auctions. E.g. "highestBidder" is actually the lowest bidder in the second stage!
    struct Bid {
        bytes32[]   lotList;            // Collateral types being liquidated
        uint256[]   lotValues;          // collateral amount up for auction             [wad]
        uint256     lotBid;             // Percentage of collateral in return for bid   [rad]
        uint256     askingAmount;       // Target dPRIME amount                         [rad]
        uint256     highestBid;         // Highest dPRIME paid                          [rad]
        address     highestBidder;      // Highest bidder
        uint256     bidExpiry;          //                                              [unix epoch time]
        uint256     auctionExpiry;      //                                              [unix epoch time]
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

    // TODO: Rename this as this is confusing for the second auction stage.
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
        auctions[id].lotBid         = 1.0;              // 100% of the collateral.
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
        
        // TODO: Bid must be higher than minimum as a % of debt or collateral. Work out which.
        // Using collateral means we have to do some maths to figure out what the lowest amount is.
        // Do we actually need this feature fi we participate in auctions ourselves? At least if we 
        // participate then the mininum bid is set by "the market" in some sense, so it's dynamic.
        // Having a fixed bid floor might be problematic for certain types of vaults.
        
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

    function stageTwoBid(uint256 id, uint256 lotBid) external {
        // The liquidator contract is always the highest bidder for a new, valid auction.
        require(auctions[id].highestBidder != address(0), "AuctionHouse/Highest bidder not set");
        // No bids after bid expiry time, which by default is 3 hours after a bid is placed.
        require(auctions[id].bidExpiry > block.timestamp || auctions[id].bidExpiry == 0, "AuctionHouse/Bid expiry reached");
        // Bids can't be placed when the auction has ended.
        require(auctions[id].auctionExpiry > block.timestamp, "AuctionHouse/Auction ended");
        // New lot bids must be lower than the current lot bid.
        require(lotBid < auctions[id].lotBid, "AuctionHouse/LotBid not lower");
        // New lot bids must be lower than the minimum decrease.
        require(minimumBidIncrease * lotBid <= auctions[id].lotBid * WAD, "AuctionHouse/Insufficient decrease");

        // TODO: How do we tell if the first stage of the auction has ended?
        //
        // Maker only progress to stage two if the asking amount is reached. Do we want to allow partial amounts to
        // go through to the second auction stage? What does this actually do for us? Does it actually help us?
        //
        // With the current setup, if there is only one bidder, they can get all the collateral very cheaply because 
        // after the first low bid expires then the auction ends and all the collateral can be claimed. The auction 
        // process doesn't even enter stage two. this is bad for the protocol and the user because protocol doesn't get
        // the penalty and the user loses all their collateral because presumably the only bid is very low.
        //
        // If we allow stage two to begin with a bid less than asking amount, then it's more complicated to ascertain if
        // stage one has finished and it's really the same outcome as what makerDAO currently does because if there is 
        // only one bidder than that one bidder is not going to voluntarily accept less collateral in stage two. They will
        // just claim the collateral when the bid expiry is reached. If there are ultipel bidders then the auction will
        // likely go to stage two anyway and if it doesn't then the highest bid will be orders of magnitude higher than it 
        // would have been with just a single bidder.

        // This stage can only start once stage one has finished.
        // require(lotBid == auctions[id].tab, "Flipper/tend-not-finished");

        // The lowest bidder at this stage, if not the highest bidder in the first stage has to move the 
        // amount of dPRIME decided in the first stage to the prior highest bidder.
        if (msg.sender != auctions[id].highestBidder) {
            lmcv.moveDPrime(msg.sender, auctions[id].highestBidder, auctions[id].highestBid);
            auctions[id].highestBidder = msg.sender;
        }

        // TODO: Move some percentage of the collateral back to the user.
        // This moves everything.
        for(uint256 i = 0; i < auctions[id].lotList.length; i++) {
            lmcv.moveCollateral( auctions[id].lotList[i], msg.sender, address(this), auctions[id].lotValues[i]);
        }

        auctions[id].lotBid = lotBid;
        auctions[id].bidExpiry = uint256(block.timestamp) + bidExpiry;
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
        // TODO: Need to multiply lotValues by the % bid for.
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
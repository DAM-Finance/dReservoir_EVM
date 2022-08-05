// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function moveDPrime(bytes32 collat, address src, address dst, uint256 wad) external;
    function moveCollateral(address src, address dst, uint256 rad) external;
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
        uint256 bid;    // Highest dPRIME paid              [rad]
        uint256 tab;    // arget dPRIME amount              [rad]
        uint256 lot;    // collateral amount up for auction [wad]           // TODO: Update to be collateralList.
        address guy;    // highest bidder
        uint48  tic;    // Bid expiry time                  [unix epoch time]
        uint48  end;    // Auction expiry time              [unix epoch time]
        address usr;    // Liquidated user
        address gal;    // Treasury address
    }
    mapping (uint256 => Bid)    public              bids;
    LMCVLike                    public immutable    lmcv;                   // LMCV.
    uint256                     public              live;                   // Active flag.
    uint256                     public              beg         = 1.05E18;  // 5% minimum bid increase
    uint48                      public              ttl         = 3 hours;  // 3 hours bid duration         [seconds]
    uint48                      public              tau         = 2 days;   // 2 days total auction length  [seconds]
    uint256                     public              auctions    = 0;

    //
    // --- Events ---
    //

    event StartAuction();
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

    //
    // --- User functions ---
    //

    function start(address user, address treasury, uint256 tab, uint256[] calldata collateralList, uint256 bid) external auth {
        require(auctions < uint256(-1), "AuctionHouse/id overflow");
        id = ++auctions;

        bids[id].bid = bid;
        bids[id].lot = collateralList;                     // TODO: Update to be collateral list.
        bids[id].guy = msg.sender;
        bids[id].end = add(uint48(now), tau);
        bids[id].usr = user;
        bids[id].gal = treasury;
        bids[id].tab = tab;

        // For each collateral type.
        // Move collateral to AuctionHouse's account.
        vat.flux(ilk, msg.sender, address(this), lot);

        emit StartAuction();
    }

    function stageOneBid() external {
        // TODO.
    }

    function stageTwoBid() external {
        // TODO.
    }

    function takeWinnings() external {
        // TODO.
    }

    function abortAuction() auth {
        // TODO.
    }
}
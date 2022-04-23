// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

interface ClipperLike {
    function ilk() external view returns (bytes32);
    function kick(
        uint256 tab,
        uint256 lot,
        address usr,
        address kpr
    ) external returns (uint256);
}

interface VatLike {
    function ilks(bytes32) external view returns (
        uint256 Art,  // [wad]
        uint256 rate, // [ray]
        uint256 spot, // [ray]
        uint256 line, // [rad]
        uint256 dust  // [rad]
    );
    function urns(bytes32,address) external view returns (
        uint256 ink,  // [wad]
        uint256 art   // [wad]
    );
    function grab(bytes32,address,address,address,int256,int256) external;
    function hope(address) external;
    function nope(address) external;
}

interface VowLike {
    function fess(uint256) external;
}

contract Liquidation {
    // --- Auth ---
    mapping (address => uint256) public wards;
    function rely(address usr) external auth { wards[usr] = 1; emit Rely(usr); }
    function deny(address usr) external auth { wards[usr] = 0; emit Deny(usr); }
    modifier auth {
        require(wards[msg.sender] == 1, "Dog/not-authorized");
        _;
    }

    // --- Data ---
    struct Ilk {
        address clip;  // Liquidator
        uint256 chop;  // Liquidation Penalty                                          [wad]
        uint256 hole;  // Max DAI needed to cover debt+fees of active auctions per ilk [rad]
        uint256 dirt;  // Amt DAI needed to cover debt+fees of active auctions per ilk [rad]
    }

    VatLike immutable public vat;  // CDP Engine
    address public fees; // Fees sent to this address

    mapping (bytes32 => Ilk) public ilks;

    VowLike public vow;   // Debt Engine
    uint256 public live;  // Active Flag

    // --- Events ---
    event Rely(address indexed usr);
    event Deny(address indexed usr);

    // --- Init ---
    constructor(address vat_, address fees_) public {
        vat = VatLike(vat_);
        live = 1;
        wards[msg.sender] = 1;
        fees = fees_;
        emit Rely(msg.sender);
    }

    //






}

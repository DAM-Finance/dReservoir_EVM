// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

interface DaiLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface VatLike {
    function move(address,address,uint256) external;
}

contract dPrimeJoin {
    VatLike public immutable vat;       // CDP Engine
    DaiLike public immutable dai;       // Stablecoin Token
    uint256 constant RAY = 10 ** 27;

    // --- Events ---
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    constructor(address vat_, address dai_) {
        vat = VatLike(vat_);
        dai = DaiLike(dai_);
    }

    // --- User's functions ---
    function join(address usr, uint256 wad) external {
        vat.move(address(this), usr, RAY * wad);
        dai.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        vat.move(msg.sender, address(this), RAY * wad);
        dai.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

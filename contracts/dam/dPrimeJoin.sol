// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface VatLike {
    function moveStable(address,address,uint256) external;
}

contract dPrimeJoin {
    VatLike public immutable vat;       // CDP Engine
    dPrimeLike public immutable dPrime;       // Stablecoin Token
    uint256 constant RAY = 10 ** 27;

    // --- Events ---
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    constructor(address vat_, address dPrime_) {
        vat = VatLike(vat_);
        dPrime = dPrimeLike(dPrime_);
    }

    // --- User's functions ---
    function join(address usr, uint256 wad) external {
        vat.moveStable(address(this), usr, RAY * wad);
        dPrime.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        vat.moveStable(msg.sender, address(this), RAY * wad);
        dPrime.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

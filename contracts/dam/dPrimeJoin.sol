// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface dPrimeLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function pushDPrime(address src, uint256 rad) external;
    function pullDPrime(address src, uint256 rad) external;
}

contract dPrimeJoin {
    LMCVLike public immutable lmcv;         // CDP Engine
    dPrimeLike public immutable dPrime;     // Stablecoin Token
    uint256 constant RAY = 10 ** 27;
    uint256 mintFee;                        // [ray]
    address treasury;
    address lmcvProxy;

    // --- Events ---
    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);
    event FeeChange(uint256 indexed mintFee);

    modifier auth {
        require(msg.sender == lmcvProxy, "dPrimeJoin/not-authorized");
        _;
    }

    constructor(address _lmcv, address _dPrime, address _lmcvProxy, address _treasury, uint256 _mintFee) {
        require(_lmcv != address(0x0)
            && _dPrime != address(0x0)
            && _lmcvProxy != address(0x0)
            && _treasury != address(0x0),
            "dPrimeJoin/Can't be zero address"
        );
        lmcv = LMCVLike(_lmcv);
        dPrime = dPrimeLike(_dPrime);
        mintFee = _mintFee;
        treasury = _treasury;
        lmcvProxy = _lmcvProxy;
    }

    function setMintFee(uint256 _mintFee) external auth { // [ray]
        mintFee = _mintFee;
        emit FeeChange(mintFee);
    }

    function setTreasury(address _treasury) external auth {
        require(_treasury != address(0x0), "LMCVProxy/Can't be zero address");
        treasury = _treasury;
    }

    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    // --- User's functions ---
    function join(address usr, uint256 wad) external {
        dPrime.burn(msg.sender, wad);
        lmcv.pushDPrime(usr, wad * RAY);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        uint256 fee = _rmul(wad, mintFee); // [wad]
        lmcv.pullDPrime(msg.sender, wad * RAY);
        dPrime.mint(treasury, fee);
        dPrime.mint(usr, wad-fee);
        emit Exit(usr, wad);
    }

    function proxyExit(address usr, uint256 wad) external auth {
        uint256 fee = _rmul(wad, mintFee); // [wad]
        lmcv.pullDPrime(usr, wad * RAY);
        dPrime.mint(treasury, fee);
        dPrime.mint(usr, wad-fee);
        emit Exit(usr, wad);
    }
}

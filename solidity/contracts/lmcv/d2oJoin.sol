// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.7;

interface d2oLike {
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

interface LMCVLike {
    function moveD2o(address src, address dst, uint256 rad) external;
    function d2o(address user) external returns (uint256);
}

contract d2oJoin {

    //
    // --- Interfaces and data ---
    //

    LMCVLike    public immutable    lmcv;
    d2oLike     public immutable    d2o;
    uint256     constant            RAY = 10 ** 27;
    address                         lmcvProxy;

    //
    // --- Events ---
    //

    event Join(address indexed usr, uint256 wad);
    event Exit(address indexed usr, uint256 wad);

    //
    // --- Modifiers ---
    //

    modifier auth {
        require(msg.sender == lmcvProxy, "d2oJoin/not-authorized");
        _;
    }

    //
    // --- Init ---
    //

    constructor(address _lmcv, address _d2o, address _lmcvProxy) {
        require(_lmcv != address(0x0)
            && _d2o != address(0x0)
            && _lmcvProxy != address(0x0),
            "d2oJoin/Can't be zero address"
        );
        lmcv = LMCVLike(_lmcv);
        d2o = d2oLike(_d2o);
        lmcvProxy = _lmcvProxy;
    }

    //
    // --- User's functions ---
    //

    function join(address usr, uint256 wad) external {
        lmcv.moveD2o(address(this), usr, RAY * wad);
        d2o.burn(msg.sender, wad);
        emit Join(usr, wad);
    }

    function exit(address usr, uint256 wad) external {
        lmcv.moveD2o(msg.sender, address(this), RAY * wad);
        d2o.mint(usr, wad);
        emit Exit(usr, wad);
    }

    function proxyExit(address usr, uint256 wad) external auth {
        lmcv.moveD2o(usr, address(this), RAY * wad);
        d2o.mint(usr, wad);
        emit Exit(usr, wad);
    }
}

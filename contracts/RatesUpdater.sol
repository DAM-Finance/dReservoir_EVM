// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.7;

interface LMCVLike {
    function updateRate(int256) external;
    function AccumulatedRate() external returns (uint256);
}

contract RatesUpdater {
    
    //
    // --- Auth ---
    //

    mapping (address => uint) public wards;
    function rely(address usr) external auth { wards[usr] = 1; }
    function deny(address usr) external auth { wards[usr] = 0; }
    modifier auth { require(wards[msg.sender] == 1, "Jug/not-authorized"); _; }

    //
    // --- Data ---
    //

    uint256     public stabilityRate;   // Stability rate as an APY.                        [ray]
    uint256     public rho;             // Time of last drip [unix epoch time]
    LMCVLike    public lmcv;            // LMCV contract
    address     public vow;             // Debt Engine
    uint256     public base;            // Global, per-second stability fee contribution    [ray]

    //
    // --- Init ---
    //

    constructor(address vat_) {
        wards[msg.sender]   = 1;
        lmcv                = LMCVLike(vat_);
        stabilityRate       = ONE;
        rho                 = block.timestamp;
    }

    //
    // --- Math ---
    //

    function _rpow(uint x, uint n, uint b) internal pure returns (uint z) {
      assembly {
        switch x case 0 {switch n case 0 {z := b} default {z := 0}}
        default {
          switch mod(n, 2) case 0 { z := b } default { z := x }
          let half := div(b, 2)  // for rounding.
          for { n := div(n, 2) } n { n := div(n,2) } {
            let xx := mul(x, x)
            if iszero(eq(div(xx, x), x)) { revert(0,0) }
            let xxRound := add(xx, half)
            if lt(xxRound, xx) { revert(0,0) }
            x := div(xxRound, b)
            if mod(n,2) {
              let zx := mul(z, x)
              if and(iszero(iszero(x)), iszero(eq(div(zx, x), z))) { revert(0,0) }
              let zxRound := add(zx, half)
              if lt(zxRound, zx) { revert(0,0) }
              z := div(zxRound, b)
            }
          }
        }
      }
    }

    uint256 constant ONE = 10 ** 27;
    function _add(uint x, uint y) internal pure returns (uint z) {
        z = x + y;
        require(z >= x);
    }
    function _diff(uint x, uint y) internal pure returns (int z) {
        z = int(x) - int(y);
        require(int(x) >= 0 && int(y) >= 0);
    }
    function _rmul(uint x, uint y) internal pure returns (uint z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / ONE;
    }

    //
    // --- Administration ---
    //

    function updateStabilityRate(uint256 _stabilityRate) external auth {
        stabilityRate = _stabilityRate;
    }

    //
    // --- User functions ---
    //

    function drip() external returns (uint rate) {
        require(block.timestamp >= rho, "Jug/invalid-now");
        uint256 prev = lmcv.AccumulatedRate();
        rate = _rmul(_rpow(_add(base, stabilityRate), block.timestamp - rho, ONE), prev);
        lmcv.updateRate(_diff(rate, prev));
        rho = block.timestamp;
    }
}
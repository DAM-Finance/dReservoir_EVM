// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.7;

import "hardhat/console.sol";

interface LMCVLike {
    function updateRate(int256) external;
    function AccumulatedRate() external returns (uint256);
}

/**
 * RatesUpdates.sol - allows any interested party to accrue interest on any
 * LMCV vaults. If the vault has a debt (ie. it has issued dPRIME), then interest
 * will accrue, compounding on a per second basis, set by the `stabilityRate` 
 * property of this contract. Note: if a user issues dPRIME, then redeems the 
 * full amount and `aaccrueInterest` in not called in between the issuance and
 * redemption, then no interest would have accrue on the debt in respect of the 
 * issued dPRIME. In other words, interest only accrues is someone calls 
 * `accrueInterest`.
 */
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

    uint256     public stabilityRate;   // [ray] Stability rate as a per second compounding rate.
    uint256     public lastAccrual;     // [unix epoch time] Time of last accrual 
    LMCVLike    public lmcv;            // LMCV contract

    //
    // --- Init ---
    //

    /**
     * Rate defaults to one, meaning there is no interest by default.
     * Rate must be set greater than one for iterest to accrue.
     */
    constructor(address lmcvAddress) {
        wards[msg.sender]   = 1;
        lmcv                = LMCVLike(lmcvAddress);
        stabilityRate       = ONE;
        lastAccrual         = block.timestamp;
    }

    //
    // --- Math ---
    //

    /**
     * Calculates powers, taken direcly from MakerDAO jug.sol.
     */
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

    function changeStabilityRate(uint256 _stabilityRate) external auth {
        stabilityRate = _stabilityRate;
    }

    //
    // --- User functions ---
    //

    /**
     * Calculates the new accumualated rate and updates the LMCV. Can be called by anyone.
     */
    function accrueInterest() external returns (uint256 rate) {
        require(block.timestamp >= lastAccrual, "RatesUpdater/invalid block.timestamp");
        uint256 prevAccrualTime = lastAccrual;
        lastAccrual = block.timestamp;
        uint256 prev = lmcv.AccumulatedRate();
        rate = _rmul(_rpow(stabilityRate, block.timestamp - prevAccrualTime, ONE), prev);
        lmcv.updateRate(_diff(rate, prev));
    }
}
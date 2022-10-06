// SPDX-License-Identifier: AGPL-3.0-or-later

// Copyright (C) 2018-2020 Maker Ecosystem Growth Holdings, INC.

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity >=0.8.7;

interface OracleLike {
    function peek() external returns (uint256, bool);
}

contract OSM {

    // 
    // --- Auth ---
    //

    mapping (address => uint) public wards;
    function rely(address usr) external auth { wards[usr] = 1; }
    function deny(address usr) external auth { wards[usr] = 0; }
    modifier auth { require(wards[msg.sender] == 1, "OSM/not-authorized"); _; }

    //
    // -- Data ---
    //

    address     public      oracleAddress;
    uint256     constant    ONE_HOUR        = 3600;
    uint256     public      pokeTimeout     = ONE_HOUR;
    uint256     public      zzz;

    struct Data {
        uint256 val;
        uint256 has;
    }

    Data cur;
    Data nxt;

    //
    // --- Events ---
    //

    event ChangeOracleAddress(address indexed _oracleAddress);
    event ChangePokeTimeout(uint256 _pokeTimeout);
    event LogValue(uint256 val);
    event Stopped();
    event Started();

    constructor (address _oracleAddress) {
        require(_oracleAddress != address(0), "OSM/Address cannot be zero");
        wards[msg.sender] = 1;
        oracleAddress = _oracleAddress;
    }

    //
    // --- Admin ---
    // 

    /**
     * Only whitelisted contracts, set by an auth, can call peek, peep and read.
     */
    mapping (address => uint256) public bud;
    modifier toll { require(bud[msg.sender] == 1, "OSM/contract-not-whitelisted"); _; }
    function kiss(address a) external auth {
        require(a != address(0), "OSM/no-contract-0");
        bud[a] = 1;
    }
    function diss(address a) external auth {
        bud[a] = 0;
    }

    /** 
     * For starting and stopping the OSM in the case of an oracle attack.
    */ 
    uint256 public stopped;
    modifier stoppable { require(stopped == 0, "OSM/OSM is stopped"); _; }
    function stop() external auth { stopped = 1; emit Stopped(); }
    function start() external auth { stopped = 0; emit Started(); }

    /**
     * Updates the address where the price oracle exists.
     */
    function changeOracleAddress(address _oracleAddress) external auth {
        require(_oracleAddress != address(0), "OSM/Cannot be zero address");
        oracleAddress = _oracleAddress;
        emit ChangeOracleAddress(_oracleAddress);
    }

    /**
     * Updates the delay before the next time poke can be called.
     */
    function changePokeTimeout(uint256 _pokeTimeout) external auth {
        require(_pokeTimeout > 0, "OSM/ts-is-zero");
        pokeTimeout = _pokeTimeout;
        emit ChangePokeTimeout(_pokeTimeout);
    }

    //
    // --- User functions ---
    //

    /**
     * Sets all prices to zero. Used in the case of an oracle attack. Renders poke() a no-op.
     * We can recover by starting the oracle and poking it to get the next price.
     */
    function void() external auth {
        cur = nxt = Data(0, 0);
        stopped = 1;
        emit Stopped();
    }

    /**
     * Determines if the current block timestamp is greater than zzz plus the pokeTimeout.
     */
    function pass() public view returns (bool ok) {
        return block.timestamp >= zzz + pokeTimeout;
    }

    /**
     * Sets the current price to the next price and grabs a new next price from the 
     * specified oracle. 
     * 
     * If the value from the oracle has not been set then this function is a no-op.
     */
    function poke() external stoppable {
        require(pass(), "OSM/Called poke too soon");
        (uint256 wut, bool ok) = OracleLike(oracleAddress).peek();
        if (ok) {
            cur = nxt;
            nxt = Data(wut, 1);
            zzz = prev(block.timestamp);
            emit LogValue(cur.val);
        }
    }

    /**
     * Returns the current value. This function should normally be used by the LMCV.
     */
    function peek() external view toll returns (uint256, bool) {
        return (cur.val, cur.has == 1);
    }

    /**
     * Returns the next value. Don't normally need to use this.
     */
    function peep() external view toll returns (uint256, bool) {
        return (nxt.val, nxt.has == 1);
    }

    function read() external view toll returns (uint256) {
        require(cur.has == 1, "OSM/no-current-value");
        return cur.val;
    }

    //
    // --- Helpers ---
    //

    /**
     * Rounds down a timestamp to the nearest hour. This means that poke intervals
     * may not necessarily always be one hour but it means that poke can be called
     * at the top of the hour, every hour. 
     * 
     * E.g. 
     * If poke() was called at 1:10pm, it can next be called in 50 minutes, at 2pm.
     * If poke() was called at 1:59pm, it can next be called in 1 minutes, at 2pm.
     */
    function prev(uint ts) internal view returns (uint256) {
        require(pokeTimeout != 0, "OSM/hop-is-zero");
        return ts - (ts % pokeTimeout);
    }
}
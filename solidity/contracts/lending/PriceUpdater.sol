// SPDX-License-Identifier: AGPL-3.0-or-later

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

pragma solidity ^0.8.7;

interface LMCVLike {
    function updateSpotPrice(bytes32, uint256) external;
}

interface OSMLike {
    function peek() external returns (uint256, bool);
}

contract PriceUpdater {

    //
    // --- Auth ---
    // 

    address public ArchAdmin;
    mapping(address => uint256) public wards;

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "RatesUpdater/Must be ArchAdmin");
        ArchAdmin = newArch;
        wards[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "RatesUpdater/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        wards[usr] = 0;
        emit Deny(usr);
    }
    modifier auth {
        require(wards[msg.sender] == 1, "PriceUpdater/not-authorized");
        _;
    }



    //
    // --- Data ---
    //

    mapping (bytes32 => OSMLike) public osms;

    LMCVLike    public immutable lmcv;  // CDP Engine
    uint256     public live;

    //
    // --- Events ---
    //

    event PriceUpdate(
        bytes32 collateral,
        uint256 price
    );
    event Cage(uint256 live);
    event UpdateSource(address osm);
    event Rely(address user);
    event Deny(address user);


    // 
    // --- Init ---
    //

    constructor(address vat_) {
        require(vat_ != address(0), "PriceUpdater/Address cannot be zero");
        ArchAdmin           = msg.sender;
        wards[msg.sender]   = 1;
        lmcv                = LMCVLike(vat_);
        live                = 1;
    }

    //
    // --- Administration ---
    //

    /**
     * Updates the oracle address for this collateral type. 
     */
    function updateSource(bytes32 collateral, address _osm) external auth {
        require(_osm != address(0), "PriceUpdater/Address cannot be zero");
        osms[collateral] = OSMLike(_osm);
        emit UpdateSource(_osm);
    }

    /**
     * Stop the contract.
     */
    function cage(uint256 _live) external auth {
        live = _live;
        emit Cage(_live);
    }

    //
    // --- User functions ---
    //

    /**
     * Grabs the next spot price from the OSM and updates the LMCV.
     */
    function updatePrice(bytes32 collateral) external {
        require(live == 1, "PriceUpdater/not-live");
        (uint256 val, bool has) = osms[collateral].peek();
        uint256 spot = has ? val : 0;
        lmcv.updateSpotPrice(collateral, spot);
        emit PriceUpdate(collateral, spot);
    }
}
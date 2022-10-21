// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "../dependencies/AuthAdmin.sol";

interface dPrimeLike {
    function deny(address) external;
    function cage(uint256) external;
}

contract dPrimeGuardian is AuthAdmin("dPrimeGuardian") {

    //HYP, LZ, etc -> address deployed on this chain
    mapping (bytes32 => address) public pipeAddresses;
    address public dPrimeContract;

    event HaltedPipe(bytes32 indexed pipe);
    event CagedDPrime();

    constructor(address _dPrimeContract) {
        dPrimeContract = _dPrimeContract;
    }

    function removeConnectorAdmin(bytes32 pipeName) external auth {
        dPrimeLike(dPrimeContract).deny(pipeAddresses[pipeName]);
        emit HaltedPipe(pipeName);
    }

    function cageDPrime() external auth {
        dPrimeLike(dPrimeContract).cage(0);
        emit CagedDPrime();
    }
}
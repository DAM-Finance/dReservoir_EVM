// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "./dependencies/AuthAdmin.sol";

interface dPrimeLike {
    function deny(address) external;
    function cage(uint256) external;
}

contract dPrimeGuardian is AuthAdmin("dPrimeGuardian") {

    //HYP, LZ, etc -> address deployed on this chain
    mapping (bytes32 => address) public pipeAddresses;
    address public immutable dPrimeContract;

    event SetPipeAddress(bytes32 indexed pipeName, address pipeAddress);
    event HaltedPipe(bytes32 indexed pipe);
    event CagedDPrime();
    

    constructor(address _dPrimeContract) {
        require(_dPrimeContract != address(0), "dPrimeGuardian/invalid address");
        dPrimeContract = _dPrimeContract;
    }

    function setPipeAddress(bytes32 pipeName, address pipeAddress) external auth {
        pipeAddresses[pipeName] = pipeAddress;
        emit SetPipeAddress(pipeName, pipeAddress);
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
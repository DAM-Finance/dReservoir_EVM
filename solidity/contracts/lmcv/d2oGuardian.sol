// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "../dependencies/AuthAdmin.sol";

interface d2oLike {
    function setTransferBlockRelease(address, uint256) external;
    function deny(address) external;
    function cage(uint256) external;
}

contract d2oGuardian is AuthAdmin("d2oGuardian", msg.sender) {

    //HYP, LZ, etc -> address deployed on this chain
    mapping (bytes32 => address) public pipeAddresses;
    address public immutable d2oContract;

    event SetPipeAddress(bytes32 indexed pipeName, address pipeAddress);
    event HaltedPipe(bytes32 indexed pipe);
    event CagedUser(address indexed user);
    event CagedDeuterium();
    

    constructor(address _d2oContract) {
        require(_d2oContract != address(0), "d2oGuardian/invalid address");
        d2oContract = _d2oContract;
    }

    function setPipeAddress(bytes32 pipeName, address pipeAddress) external auth {
        pipeAddresses[pipeName] = pipeAddress;
        emit SetPipeAddress(pipeName, pipeAddress);
    }

    function removeConnectorAdmin(bytes32 pipeName) external auth {
        d2oLike(d2oContract).deny(pipeAddresses[pipeName]);
        emit HaltedPipe(pipeName);
    }

    function cageDeuterium() external auth {
        d2oLike(d2oContract).cage(0);
        emit CagedDeuterium();
    }

    function cageUser(address user) external auth {
        d2oLike(d2oContract).setTransferBlockRelease(user, 2**256 - 1);
        emit CagedUser(user);
    }


}
// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

interface dPrimeLike {
    function deny(address) external;
}

contract dPrimeGuardian {

    address public ArchAdmin;
    mapping (address => uint256) public admins;

    //HYP, LZ, etc -> address deployed on this chain
    mapping (bytes32 => address) public pipeAddresses;
    address public dPrimeContract;

    event HaltedPipe(bytes32 indexed pipe);
    event Rely(address indexed usr);
    event Deny(address indexed usr);

    modifier auth {
        require(admins[msg.sender] == 1, "dPrimeGuardian/not-authorized");
        _;
    }

    constructor(address _dPrimeContract) {
        dPrimeContract = _dPrimeContract;
        admins[msg.sender] = 1;
        ArchAdmin = msg.sender;
        emit Rely(msg.sender);
    }

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "dPrimeGuardian/Must be ArchAdmin");
        ArchAdmin = newArch;
        admins[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        admins[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "dPrimeGuardian/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        admins[usr] = 0;
        emit Deny(usr);
    }

    function haltConnector(bytes32 pipeName) external auth {
        dPrimeLike(dPrimeContract).deny(pipeAddresses[pipeName]);
        emit HaltedPipe(pipeName);
    }
}
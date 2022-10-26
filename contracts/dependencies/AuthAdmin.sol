// SPDX-License-Identifier: MIT

pragma solidity ^0.8.12;

contract AuthAdmin {
    string private parentContractName;

    address public ArchAdmin;
    mapping (address => uint256) public admins;
    uint256 public live;


    event Rely(address indexed usr);
    event Deny(address indexed usr);

    modifier auth {
        require(admins[msg.sender] == 1, string.concat(parentContractName, "/not-authorized"));
        _;
    }

    modifier alive {
        require(live == 1, string.concat(parentContractName, "/not-live"));
        _;
    }

    constructor(string memory contractName) {
        parentContractName = contractName;
        live = 1;
        admins[msg.sender] = 1;
        ArchAdmin = msg.sender;
        emit Rely(msg.sender);
    }

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), string.concat(parentContractName, "/Must be ArchAdmin"));
        ArchAdmin = newArch;
        admins[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        admins[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, string.concat(parentContractName, "/ArchAdmin cannot lose admin - update ArchAdmin to another address"));
        admins[usr] = 0;
        emit Deny(usr);
    }

    function cage(uint256 _live) external auth {
        live = _live;
    }
}
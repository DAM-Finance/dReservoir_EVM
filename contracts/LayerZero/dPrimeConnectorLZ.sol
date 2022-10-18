// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./IOFT.sol";
import "./OFTCore.sol";

interface dPrimeLike {
    function decreaseAllowanceAdmin(address owner, address spender, uint256 subtractedValue) external returns (bool);
    function totalSupply() external view returns (uint256 supply);
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

// override decimal() function is needed
contract dPrimeConnectorLZ is OFTCore, IOFT {

    address public ArchAdmin;
    mapping (address => uint256) public admins;

    address public dPrimeContract;
    uint256 public live;

    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event MintLayerZero(address indexed from, uint256 amount);
    event BurnLayerZero(address indexed from, uint256 amount);

    modifier auth {
        require(admins[msg.sender] == 1, "dPrimeConnectorLZ/not-authorized");
        _;
    }

    constructor(address _lzEndpoint, address _dPrimeContract) OFTCore(_lzEndpoint) {
        dPrimeContract = _dPrimeContract;
        live = 1;
        admins[msg.sender] = 1;
        ArchAdmin = msg.sender;
        emit Rely(msg.sender);
    }

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "dPrimeConnectorLZ/Must be ArchAdmin");
        ArchAdmin = newArch;
        admins[ArchAdmin] = 1;
    }

    function rely(address usr) external auth {
        admins[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        require(usr != ArchAdmin, "dPrimeConnectorLZ/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        admins[usr] = 0;
        emit Deny(usr);
    }

    function cage(uint256 _live) external auth {
        live = _live;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(OFTCore, IERC165) returns (bool) {
        return interfaceId == type(IOFT).interfaceId || interfaceId == type(IERC20).interfaceId || super.supportsInterface(interfaceId);
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return dPrimeLike(dPrimeContract).totalSupply();
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _amount) internal virtual override {
        address spender = _msgSender();
        if (_from != spender) {
            require(dPrimeLike(dPrimeContract).decreaseAllowanceAdmin(_from, spender, _amount),"dPrimeConnectorLZ/Must have proper allowance");
        }
        dPrimeLike(dPrimeContract).burn(_from, _amount);
        emit BurnLayerZero(_from, _amount);
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal virtual override {
        dPrimeLike(dPrimeContract).mint(_toAddress, _amount);
        emit MintLayerZero(_toAddress, _amount);
    }
}
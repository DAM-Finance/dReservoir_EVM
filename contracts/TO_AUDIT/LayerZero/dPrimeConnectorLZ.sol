// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@layerzerolabs/solidity-examples/contracts/token/oft/OFTCore.sol";
import "../dependencies/AuthAdmin.sol";
import "./IOFT.sol";

interface dPrimeLike { 
    function decreaseAllowanceAdmin(address owner, address spender, uint256 subtractedValue) external returns (bool);
    function totalSupply() external view returns (uint256 supply);
    function burn(address,uint256) external;
    function mintAndDelay(address,uint256) external;
}

contract dPrimeConnectorLZ is OFTCore, IOFT, AuthAdmin("dPrimeConnectorLZ") {

    address public dPrimeContract;

    event MintLayerZero(address indexed from, uint256 amount, uint16 _srcChainId);
    event BurnLayerZero(address indexed from, uint256 amount, uint16 _dstChainId);

    constructor(address _lzEndpoint, address _dPrimeContract) OFTCore(_lzEndpoint) {
        dPrimeContract = _dPrimeContract;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(OFTCore, IERC165) returns (bool) {
        return interfaceId == type(IOFT).interfaceId || interfaceId == type(IERC20).interfaceId || super.supportsInterface(interfaceId);
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return dPrimeLike(dPrimeContract).totalSupply();
    }

    function _debitFrom(address _from, uint16 _dstChainId, bytes memory, uint _amount) internal virtual override alive {
        address spender = _msgSender();
        if (_from != spender) {
            require(dPrimeLike(dPrimeContract).decreaseAllowanceAdmin(_from, spender, _amount),"dPrimeConnectorLZ/Must have proper allowance");
        }
        dPrimeLike(dPrimeContract).burn(_from, _amount);
        emit BurnLayerZero(_from, _amount, _dstChainId);
    }

    function _creditTo(uint16 _srcChainId, address _toAddress, uint _amount) internal virtual override alive {
        dPrimeLike(dPrimeContract).mintAndDelay(_toAddress, _amount);
        emit MintLayerZero(_toAddress, _amount, _srcChainId);
    }

    function setTrustedRemoteAuth(uint16 _srcChainId, bytes calldata _path) external auth {
        trustedRemoteLookup[_srcChainId] = _path;
        emit SetTrustedRemote(_srcChainId, _path);
    }
    
    function setTrustedRemoteAddressAuth(uint16 _remoteChainId, bytes calldata _remoteAddress) external auth {
        trustedRemoteLookup[_remoteChainId] = abi.encodePacked(_remoteAddress, address(this));
        emit SetTrustedRemoteAddress(_remoteChainId, _remoteAddress);
    }
}
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@layerzerolabs/solidity-examples/contracts/token/oft/v2/BaseOFTV2.sol";
import "../dependencies/AuthAdmin.sol";

interface d2OLike {
    function decreaseAllowanceAdmin(address owner, address spender, uint256 subtractedValue) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function totalSupply() external view returns (uint256 supply);
    function burn(address,uint256) external;
    function mintAndDelay(address,uint256) external;
    function mint(address,uint256) external;
    function decimals() external returns (uint8);
}

contract LayerZeroPipe is BaseOFTV2, AuthAdmin("LayerZeroPipe", msg.sender) {

    uint    internal    immutable   ld2sdRate; // local 2 shared rate, for d2o should be 10^(18-6)
    address public      immutable   d2OContract;
    address public                  treasury;
    uint256 public                  teleportFee; // [ray]

    event MintLayerZero(address indexed from, uint256 amount, uint16 _srcChainId);
    event BurnLayerZero(address indexed from, uint256 amount, uint16 _dstChainId);
    event SetTeleportFee(uint256 teleportFee);

    constructor(address _lzEndpoint, address _d2OContract, address _treasury, uint8 _sharedDecimals) BaseOFTV2(_sharedDecimals, _lzEndpoint) {
        require(_lzEndpoint != address(0) && _d2OContract != address(0), "d2OConnectorLZ/invalid address");
        d2OContract = _d2OContract;
        uint8 decimals = d2OLike(d2OContract).decimals();
        ld2sdRate = 10 ** (decimals - _sharedDecimals);
        treasury = _treasury;
    }

    //
    // --- Maths ---
    //
    
    uint256 constant RAY = 10 ** 27;
    // Can only be used sensibly with the following combination of units:
    // - `_wadmul(wad, ray) -> wad`
    function _wadmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    function setTreasury(address _treasury) external auth {
        require(_treasury != address(0x0), "d2OConnectorLZ/Can't be zero address");
        treasury = _treasury;
    }

    function setTeleportFee(uint256 _teleportFee) external auth {
        require(_teleportFee < RAY, "d2OConnectorLZ/Fees must be less than 100%");
        teleportFee = _teleportFee;
        emit SetTeleportFee(teleportFee);
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return d2OLike(d2OContract).totalSupply();
    }

    function token() public view virtual override returns (address) {
        return d2OContract;
    }

    function _debitFrom(address _from, uint16 _dstChainId, bytes32, uint _amount) internal virtual override alive returns (uint) {
        address spender = _msgSender();
        if (_from != spender) {
            require(d2OLike(d2OContract).decreaseAllowanceAdmin(_from, spender, _amount),"d2OConnectorLZ/Must have proper allowance");
        }
        d2OLike(d2OContract).burn(_from, _amount);
        emit BurnLayerZero(_from, _amount, _dstChainId);
        return _amount;
    }

    function _creditTo(uint16 _srcChainId, address _toAddress, uint _amount) internal virtual override alive returns (uint) {
        uint256 feeAmount = _wadmul(_amount, teleportFee); // wadmul(wad * ray) = wad
        d2OLike(d2OContract).mint(treasury, feeAmount);
        d2OLike(d2OContract).mintAndDelay(_toAddress, _amount - feeAmount);
        emit MintLayerZero(_toAddress, _amount, _srcChainId);
        return _amount;
    }

    function _transferFrom(address _from, address _to, uint _amount) internal virtual override returns (uint) {
        address spender = _msgSender();
        if (_from != address(this) && _from != spender) {
            require(d2OLike(d2OContract).decreaseAllowanceAdmin(_from, spender, _amount),"d2OConnectorLZ/Must have proper allowance");
        }
        d2OLike(d2OContract).transferFrom(_from, _to, _amount);
        return _amount;
    }

    function setTrustedRemoteAuth(uint16 _srcChainId, bytes calldata _path) external auth {
        trustedRemoteLookup[_srcChainId] = _path;
        emit SetTrustedRemote(_srcChainId, _path);
    }
    
    function setTrustedRemoteAddressAuth(uint16 _remoteChainId, bytes calldata _remoteAddress) external auth {
        trustedRemoteLookup[_remoteChainId] = abi.encodePacked(_remoteAddress, address(this));
        emit SetTrustedRemoteAddress(_remoteChainId, _remoteAddress);
    }

    function _ld2sdRate() internal view virtual override returns (uint) {
        return ld2sdRate;
    }
}
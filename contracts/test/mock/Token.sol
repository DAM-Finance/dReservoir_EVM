// SPDX-License-Identifier: GPL-3.0-or-later

/// token.sol -- ERC20 implementation with minting and burning

pragma solidity ^0.8.7;

contract MockToken {
    uint256                                           public  totalSupply;
    mapping (address => uint256)                      public  balanceOf;
    mapping (address => mapping (address => uint256)) public  allowance;
    string                                            public  symbol;
    uint8                                             public  decimals = 18; // standard token precision. override to customize


    constructor(string memory symbol_) {
        symbol = symbol_;
    }

    function approve(address guy) external returns (bool) {
        return approve(guy, type(uint256).max);
    }

    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;

        return true;
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "token-insufficient-approval");
            allowance[src][msg.sender] = allowance[src][msg.sender] - wad;
        }

        require(balanceOf[src] >= wad, "token-insufficient-balance");
        balanceOf[src] = balanceOf[src] - wad;
        balanceOf[dst] = balanceOf[dst] + wad;

        return true;
    }

    function mint(uint256 wad) external {
        mint(msg.sender, wad);
    }

    function burn(uint256 wad) external {
        burn(msg.sender, wad);
    }

    function mint(address guy, uint256 wad) public {
        balanceOf[guy] = balanceOf[guy] + wad;
        totalSupply = totalSupply + wad;
    }

    function burn(address guy, uint256 wad) public {
        if (guy != msg.sender && allowance[guy][msg.sender] != type(uint256).max) {
            require(allowance[guy][msg.sender] >= wad, "token-insufficient-approval");
            allowance[guy][msg.sender] = allowance[guy][msg.sender] - wad;
        }

        require(balanceOf[guy] >= wad, "token-insufficient-balance");
        balanceOf[guy] = balanceOf[guy] - wad;
        totalSupply = totalSupply - wad;
    }
}

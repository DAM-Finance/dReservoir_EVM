//SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IERC20Adapter.sol";

contract MultiCollateralVault is ERC721("MCV", "MultiCollateralVault") {

    mapping(address => uint)                                public admins;
    mapping(uint256 => mapping(IERC20Adapter => uint256))   public idToCoinAmounts;
    mapping(IERC20Adapter => bool)                          public isCoinSupported;
    mapping(uint256 => IERC20Adapter[])                     public idToCoins;
    mapping(IERC20Adapter => string)                        public supportedCoinNames;

    IERC20Adapter[] public supportedCoinList;

    uint256 public live;
    uint256 public currentId;

    modifier auth {
        require(admins[msg.sender] == 1, "MCV/Not-Authorized");
        _;
    }

    modifier alive {
        require(live == 1, "MCV/paused");
        _;
    }

    constructor() {
        currentId = 0;
        live = 1;
        admins[msg.sender] = 1;
    }

    function updateStatus(uint256 status) external auth {
        live = status;
    }
    //TODO: Everything
    function addCoinSupport(IERC20Adapter coin) external auth {

    }


    function addCollateral(IERC20Adapter[] memory collateralTokens, uint256[] memory amounts, uint256 tokenId) internal alive {
        require(collateralTokens.length == amounts.length, "Need amounts for each collateral token");

        for (uint256 i = 0; i < collateralTokens.length; i++) {
            //TODO: When addCoinSupport works
            // require(isCoinSupported[collateralTokens[i]], "Coin not supported");
            uint256 startingBalance = collateralTokens[i].balanceOf(address(this));

            bool successfulTransfer = collateralTokens[i].transferFrom(msg.sender, address(this), amounts[i]);
            require(successfulTransfer, "Transfer did not work");

            uint256 finalBalance = collateralTokens[i].balanceOf(address(this));
            require(finalBalance == (startingBalance + amounts[i]), "Balance is incorrect");

            idToCoinAmounts[tokenId][collateralTokens[i]] = amounts[i];
        }

        idToCoins[tokenId] = collateralTokens;

    }

    //TODO: Finish
    function mint(IERC20Adapter[] memory collateralTokens, uint256[] memory amounts) external {
        addCollateral(collateralTokens, amounts, currentId);
        _safeMint(_msgSender(), currentId);
        currentId++;
    }



}

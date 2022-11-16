// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.7;

import {Router} from "@hyperlane-xyz/app/contracts/Router.sol";
import "../dependencies/AuthAdmin.sol";

interface dPrimeLike {
    function decreaseAllowanceAdmin(address owner, address spender, uint256 subtractedValue) external returns (bool);
    function totalSupply() external view returns (uint256 supply);
    function burn(address,uint256) external;
    function mintAndDelay(address,uint256) external;
}

/**
 * @title Hyperlane Token that extends the ERC20 token standard to enable native interchain transfers.
 * @author Abacus Works
 * @dev Supply on each chain is not constant but the aggregate supply across all chains is.
 */
contract dPrimeConnectorHyperlane is Router, AuthAdmin("dPrimeConnectorHyperlane") {

    // Origin chain -> recipient address -> nonce -> amount
    mapping (uint32 => mapping(address => mapping(uint256 => uint256))) failedMessages;
    address public dPrimeContract;
    uint256 public nonce;

    /**
     * @dev Emitted on `transferRemote` when a transfer message is dispatched.
     * @param destination The identifier of the destination chain.
     * @param recipient The address of the recipient on the destination chain.
     * @param amount The amount of tokens burnt on the origin chain.
     */
    event SentTransferRemote(
        uint32 indexed destination,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @dev Emitted on `_handle` when a transfer message is processed.
     * @param origin The identifier of the origin chain.
     * @param recipient The address of the recipient on the destination chain.
     * @param amount The amount of tokens minted on the destination chain.
     */
    event ReceivedTransferRemote(
        uint32 indexed origin,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @dev Emitted on `_handle` when a transfer message has failed.
     * @param origin The identifier of the origin chain.
     * @param recipient The address of the recipient on the destination chain.
     * @param nonce The nonce of the message to avoid overwrites
     * @param amount The amount of tokens to be minted on the destination chain.
     */
    event FailedTransferRemote(
        uint32 indexed origin,
        address indexed recipient,
        uint256 nonce,
        uint256 amount
    );

    /**
     * @notice Initializes the Hyperlane router, ERC20 metadata, and mints initial supply to deployer.
     * @param _abacusConnectionManager The address of the connection manager contract.
     * @param _interchainGasPaymaster The address of the interchain gas paymaster contract.
     */
    function initialize(
        address _abacusConnectionManager,
        address _interchainGasPaymaster,
        address _dPrimeContract
    ) external initializer auth {
        require(_abacusConnectionManager != address(0) 
        && _interchainGasPaymaster != address(0) 
        && _dPrimeContract != address(0), 
        "dPrimeConnectorHyperlane/invalid address");

        // Set ownable to sender
        _transferOwnership(msg.sender);
        // Set ACM contract address
        _setAbacusConnectionManager(_abacusConnectionManager);
        // Set IGP contract address
        _setInterchainGasPaymaster(_interchainGasPaymaster);

        dPrimeContract = _dPrimeContract;
    }

    /**
     * @notice Transfers `_amount` of tokens from `msg.sender` to `_recipient` on the `_destination` chain.
     * @dev Burns `_amount` of tokens from `msg.sender` on the origin chain and dispatches
     *      message to the `destination` chain to mint `_amount` of tokens to `recipient`.
     * @dev Emits `SentTransferRemote` event on the origin chain.
     * @param _destination The identifier of the destination chain.
     * @param _recipient The address of the recipient on the destination chain.
     * @param _amount The amount of tokens to be sent to the remote recipient.
     */
    function transferRemote(
        uint32 _destination,
        address _recipient,
        uint256 _amount
    ) external payable alive {
        require(_amount > 0, "dPrimeConnectorHyperlane/Amount cannot be zero");
        require(_recipient != address(0), "dPrimeConnectorHyperlane/Recipient address cannot be zero");
        dPrimeLike(dPrimeContract).burn(msg.sender, _amount);
        _dispatchWithGas(
            _destination,
            abi.encode(_recipient, _amount),
            msg.value
        );
        emit SentTransferRemote(_destination, _recipient, _amount);
    }

    /**
     * @dev Mints tokens to recipient when router receives transfer message.
     * @dev Emits `ReceivedTransferRemote` event on the destination chain.
     * @param _origin The identifier of the origin chain.
     * @param _message The encoded remote transfer message containing the recipient address and amount.
     */
    function _handle(
        uint32 _origin,
        bytes32,
        bytes memory _message
    ) internal override alive {

        (address recipient, uint256 amount) = abi.decode(
            _message,
            (address, uint256)
        );

        try dPrimeLike(dPrimeContract).mintAndDelay(recipient, amount) {
            emit ReceivedTransferRemote(_origin, recipient, amount);
        } catch {
            failedMessages[_origin][recipient][nonce] = amount;
            emit FailedTransferRemote(_origin, recipient, nonce, amount);
        }
        nonce++;
    }

    /**
     * @dev Retries previous failed mints.
     * @dev Emits `ReceivedTransferRemote` event on the destination chain.
     * @param _origin The identifier of the origin chain.
     * @param _recipient The address of the recipient on receiving chain.
     */
    function retry(uint32 _origin, address _recipient, uint256 _nonce) external alive {
        uint256 amount = failedMessages[_origin][_recipient][_nonce];
        require(amount > 0, "dPrimeConnectorHyperlane/Amount must be greater than 0 to retry");

        try dPrimeLike(dPrimeContract).mintAndDelay(_recipient, amount) {
            delete failedMessages[_origin][_recipient][_nonce];
            emit ReceivedTransferRemote(_origin, _recipient, amount);
        } catch {
            emit FailedTransferRemote(_origin, _recipient, nonce, amount);
        }
    }

    /**
     * @notice Register the address of a Router contract for the same Application on a remote chain
     * @param _domain The domain of the remote Application Router
     * @param _router The address of the remote Application Router
     */
    function enrollRemoteRouter(uint32 _domain, bytes32 _router) external override auth {
        _enrollRemoteRouter(_domain, _router);
    }
}
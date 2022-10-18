// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.7;

import {Router} from "@hyperlane-xyz/app/contracts/Router.sol";

interface dPrimeLike {
    function decreaseAllowanceAdmin(address owner, address spender, uint256 subtractedValue) external returns (bool);
    function totalSupply() external view returns (uint256 supply);
    function burn(address,uint256) external;
    function mint(address,uint256) external;
}

/**
 * @title Hyperlane Token that extends the ERC20 token standard to enable native interchain transfers.
 * @author Abacus Works
 * @dev Supply on each chain is not constant but the aggregate supply across all chains is.
 */
contract dPrimeConnectorHyperlane is Router {

    address public ArchAdmin;
    mapping (address => uint256) public admins;

    address public dPrimeContract;
    uint256 public live;

    event Rely(address indexed usr);
    event Deny(address indexed usr);

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

    modifier auth {
        require(admins[msg.sender] == 1, "dPrimeConnectorLZ/not-authorized");
        _;
    }

    modifier alive {
        require(live == 1, "PSM/not-live");
        _;
    }

    /**
     * @notice Initializes the Hyperlane router, ERC20 metadata, and mints initial supply to deployer.
     * @param _abacusConnectionManager The address of the connection manager contract.
     * @param _interchainGasPaymaster The address of the interchain gas paymaster contract.
     */
    function initialize(
        address _abacusConnectionManager,
        address _interchainGasPaymaster,
        address _dPrimeContract
    ) external initializer {
        // Set ownable to sender
        _transferOwnership(msg.sender);
        // Set ACM contract address
        _setAbacusConnectionManager(_abacusConnectionManager);
        // Set IGP contract address
        _setInterchainGasPaymaster(_interchainGasPaymaster);

        dPrimeContract = _dPrimeContract;
        live = 1;
        admins[msg.sender] = 1;
        ArchAdmin = msg.sender;
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
        dPrimeLike(dPrimeContract).mint(recipient, amount);
        emit ReceivedTransferRemote(_origin, recipient, amount);
    }
}
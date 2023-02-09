# DAM Finance

## Introduction

DAM Finance is an over-collateralised stablecoin protocol which draws insipriation from MakerDAO. The codebase is based upon the MakerDAO codebase and we have made changes were necessary to facilitate our requirements. Keys changes we have made are:

1. **Linked Multi-collateral vault** Allow users to pool all their collateral in a single vault instead of having a vault for each type of collateral. The impact of this is that users can take advantage of collateral which may not be suitable for minting an over-collateralised stablecoin in isolation. This also means that each vault has a unique weighted average liquidation LTV based upon the LTV for each of the constituent tokens making up the vault collateral. 
2. **Leverage** Users can re-deposit d2O back into their vaults to mint more d2O. The protocol understands that this is a leveraged token and as such affects the way the weighted average LTV is calculated for the vault. Using a leveraged token as collateral allows the minting of more d2O but changes in value of the underlying collateral (i.e. not the d2Os) have a greater impact on the portfolio value of the vault, due to its leveraged nature. There is a protocol-wide leverage cap set by the `lockedAmountLimit` for d2Os in `LMCV.sol`. This value will occasionally need updating so that protocol-wide leverage is capped at 2x.
3. **Minting fee** We have added the capability to chage a minting fee when d2O is minted.
4. **Peg stability module** Users can deposit certain stablecoins in the peg stability module which allows them to mint d2O 1:1 or at a near 1:1 ratio. Clearly, if a user needs to re-collateralise their vault then depositing stablecoins is the most effective way to do that. Stablecoin liquidity on Moonbeam is somewhat fragmented, therefore we will look to incentivise users to consolidate liquidity by minting d2O from a range of existing stablecoins by not levying fees or interest.
5. **Staking contract** To incentivise secondary market liquidity for d2O we intend to create a staking contract for holders of d2Os, i.e. those who have deposited their d2O into a curve stableswap pool. Rewards will accrue to those partipating in the DAM staking contract.

Other key features:

1. **Accumulated rate** As with the MakerDAO protocol, we charge a variable interest rate, which compounds on a per second basis as a percentage of total borrowing. The existence of the interest rate -- which can be set to zero if necessary but cannot be negative -- is to manage the supply/demand curve for d2O and help with peg stability.
2. **Liquidations and auctions** Unhealthy vaults will be liquidated and auctioned off to keepers. We are using an adapted version of the MakerDAO (cat.sol)[https://github.com/makerdao/dss/blob/master/src/cat.sol] for our auction process. To incentivise liquidation a liquidation discount will be offered.
3. **Oracle price feeds** For delayed hourly updates to protfolio values.
4. **Accepted collateral** We can update the accepted collateral list. Add new collateral, remove existing collateral or update propeties of existing collateral types.
5. **Protocol-wide caps** As with other similar protocols we can set caps on the total debt limit (d2O issuance) as well as on each type of collateral.
6. **Protocol surplus and deficit** Any fees or interest payable by users credit the protocol surplus. Any bad debt which accrues as a result of auction shortfalls are accounted for as a protocol deficit. The existence of a deficit doesn't necessarily mean that d2O is undercollateralised -- as in the d2O value of the collateral is less the total amount of issued d2O. Instead, it means that d2O is *less* collateralised than it was before a deficit was recognised. Indeed, at the point a deficit is registered, the aggerate LTV for the protocol will increase. The surplus can be used by the stewards of the protocol in a variety of ways: to pay rewards to stakers, to plug the protocol's deficit.

## Documentation

Take a look at this [high level flow diagram](docs/High-level%20protocol%20flows.png) for an idea of how the protocol operates at a high-level and the various stakeholers which are involved. There is also a [function-call level diagram](docs/function%20level%20flow%20diagram.png) which shows how the contracts compose to form the entire protocol. In this diagram, it is worth noting that:

1. Contracts marked with an asterisk are not yet completed but we have included them i nthe diagram.
2. The staking contract has not yet been added to the diagram as we are still finalising the design.
3. We have also left of the individual permissioning admin functions (e.g.`rely` `deny`) for each of the anxillary contracts.

Contract specific documentation:

### LMCV

**[LMCV.sol](contracts/lmcv/LMCV.sol) - The main accounting system for the protocol**

* Keeps track of how much collateral each user has deposited with the platform.
* Keeps track of how much collateral each user has committed to a vault.
* Keeps track of the debt balance / d2O issued to each user.
* Stores an accumulated stability rate to keep track of how much interest is payable on issued d2O.
* Provides an API for liquidations, as well as minting unbacked d2O or burning issued d2O.
* Provides an API for moving unlocked collateral or d2O between accounts.
* Admin interface for editing collateral types or and collateral information.

**[d2O.sol](contracts/lmcv/d2O.sol) - for minting, burning and moving tokenized d2O**

* A Standard ERC20 contract based upon dai.sol.

**[CollateralJoin.sol](contracts/lmcv/CollateralJoin.sol) - for depositing/withdrawing ERC20 tokens into the protocol**

* Based upon the join contracts from MakerDAO.
* Allows users to deposit or withdraw unlocked collateral. 

**[CollateralJoinDecimals.sol](contracts/lmcv/CollateralJoinDecimals.sol) - for depositing/withdrawing ERC20 tokens into the protocol**

* As above but for stablecoins with a fewer number of precision digits.

**[d2OJoin.sol](contracts/lmcv/d2OJoin.sol) - for depositing/withdrawing d2O into the protocol**

* Based upon the DAI join contract from MakerDAO.
* Allows users to deposit or withdraw unlocked d2O from the protocol. 

**[PSM.sol](contracts/lmcv/PSM.sol) - for minting/burning d2O 1:1 via other accepted stablecoins**

* Allows users to directly mint d2O 1:1 with other accepted stablecoins
* Calls join/exit and loan/repay directly on the collateral join contracts and the LMCV
* Optional mint and burn fee can be set
* d2O minted via the PSM counts as collateral towards the user's vault

**[WGLMR.sol](contracts/lmcv/WGLMR.sol) - for wrapping the native token (Glimmer)**

* Saves us from having a separate join contract for Glimmer.
* Fairly standard design: deposit/withdraw/transfer/etc.

**[Liquidation.sol](contracts/lmcv/Liquidation.sol) - for kicking off the vault liquidation process**

* Based upon the MakerDAO "Cat.sol"
* Admins for the Liquidation contract can specify an auction lot size - this is the maxmimum amount of d2O which can be raised in a single auction
* Note that many auctions can happen in parallel though
* If the vault size is less than the lot size then the whole vault will be liquidated, the amount to liquidate is the total normalized debt multiplied by the accumulated stability rate
* If the vault size is greater than the lot size then the amount to liquidate is the lot size divided by the stability rate and divided by the liquidation penalty, the number we end up with after these divisions is an amount of normalized debt, when multiplied by the accumualted stabiltiy rate and the liquidation penalty, gets us to a d2O amount which is equal to the lot size.
* The liquidation penalty can be set by the contract admin and is used as a deterrant to stop users willfully liquidating their vaults to potentially buy back the collateral at a discount. The penalty also does what it says on the tin, it's a punishment for being liquidated. The proceeds of the liquidation penalty go to the protocol treasury and are most liqkely used to indemnify teh protocol in case of bad debt losses.
* The Liquidation contract transfers the necessary collateral to its account when `liquidate` is called. The amount transferred is a multiple of the `debtHaircut` to the total normalized debt. I.e. if the whole vault is liquidated because it's smaller than the lot size then all of the collateral is confiscated. If the vault is larger than the lot size then the same percentage of collateral is confiscated as normalized debt liquidated.
* The last thing this `liquidate` does is start the auction process.

**[AuctionHouse.sol](contracts/lmcv/AuctionHouse.sol) - auctions off collateral for d2O which is then burnt to offset the protocol deficit**

* TBC. We probably need a long section on how the auction process works with diagrams so it's easily understandable.

**[RatesUpdater.sol](contracts/lmcv/RatesUpdater.sol) - allows keepers to accrue interest on all vaults**

**[PriceUpdater.sol](contracts/lmcv/PriceUpdater.sol) - allows keepers to update the spot price for a collateral type**

**[OSM.sol](contracts/lmcv/OSM.sol) - "Oracle stability module" which introduces a delay before collateral prices are updated to aid in the deference against any potential oracle attack**

**[ChainlinkClient.sol](contracts/lmcv/ChainlinkClient.sol) - A client for the Chainlink Oracle on Moonbeam**

### Staking

**[d3O.sol](contracts/staking/dd2O.sol) - for minting, burning and moving dd2O**

**[d3OJoin.sol](contracts/staking/dd2OJoin.sol) - for depositing and withdrawing dd2O in the staking vault**

**[RewardJoin.sol](contracts/staking/RewardJoin.sol) - for depositing and withdrawing reward tokens in the staking vault**

**[StakeJoin.sol](contracts/staking/StakeJoin.sol) - for depositing and withdrawing the staking token in the staking vault**

**[StakingVault.sol](contracts/staking/StakingVault.sol) - the staking vault accounting system**

## Limitations / future features

1. In V1 no interest is payable on d2O deposits.
2. In V1 there is no governance token and therefore no decentralised governance or protocol enforced bail-ins/ bail-outs in the case of excessive protocol deficit.

## Deployment

For deploying a localhost version of DAM for testing use the following:

`npx hardhat node`

This sets up the local test network and executes transactions to set up all of the contracts -- permissions etc. You can then use hardhat tasks to interact with the contracts e.g.

1. `npx hardhat eth-balance --address [ADDRESS] --network localhost` 
2. `npx hardhat usdc-mint --address [ADDRESS] --amount [AMOUNT] --network localhost`
3. `npx hardhat usdc-balance --address [ADDRESS] --network localhost`
4. `npx hardhat d2o-swap --address [ADDRESS] --amount [AMOUNT] --network localhost`
5. `npx hardhat d2o-balance --address [ADDRESS] --network localhost`
6. `npx hardhat d2o-teleport-layer-zero --address [ADDRESS] --amount [AMOUNT] --network localhost --source 1 --dest 2` - for teleporting using the local test network we use the LayerZero mock end-point which simulates the existence of two networks. With this approach there are two d2O contracts, two end-points and two connectors. One end-point has id `1` and the other id `2`. 
7. `npx hardhat d2o-teleport-hyperlane --address [ADDRESS] --amount [AMOUNT] --network localhost --source 1 --dest 2` - as above but uses the hyperlane mock
8. `npx hardhat d2o-burn --address [ADDRESS] --amount [AMOUNT] --network localhost`

For deploying to testnet or mainnet, use the following:

1. `npx hardhat deploy --network [NETWORK NAME]` - currently only supports Goerli and Moonbase Alpha
2. `npx hardhat setup_contracts --network [NETWORK NAME]` - currently only supports Goerli and Moonbase Alpha. This sets up all the contracts with permissions etc. It's done in a separate step to deploying with testnets and production.

You can then use the same tasks as described above for the local test network to interact with testnet and mainnet deployments. Make sure to change the network name option to the nework of choice.
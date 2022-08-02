# DAM Finance

## Introduction

DAM Finance is an over-collateralised stablecoin protocol which draws insipriation from MakerDAO. The codebase is based upon the MakerDAO codebase and we have made changes were necessary to facilitate our requirements. Keys changes we have made are:

1. **Linked Multi-collateral vault** Allow users to pool all their collateral in a single vault instead of having a vault for each type of collateral. The impact of this is that users can take advantage of collateral which may not be suitable for minting an over-collateralised stablecoin in isolation. This also means that each vault has a unique weighted average liquidation LTV based upon the LTV for each of the constituent tokens making up the vault collateral. 
2. **Leverage** Users can re-deposit dPRIME (or dPRIMEs) back into their vaults to mint more dPRIME. The protocol understands that this is a leveraged token and as such affects the way the weighted average LTV is calculated for the vault. Using a leveraged token as collateral allows the minting of more dPRIME but changes in value of the underlying collateral (i.e. not the dPRIMEs) have a greater impact on the portfolio value of the vault, due to its leveraged nature. There is a protocol-wide leverage cap set by the `lockedAmountLimit` for dPRIMEs in `LMCV.sol`. This value will occasionally need updating so that protocol-wide leverage is capped at 2x.
3. **Minting fee** We have added the capability to chage a minting fee when dPRIME is minted.
4. **Peg stability module** Users can deposit certain stablecoins in the peg stability module which allows them to mint dPRIME 1:1 or at a near 1:1 ratio. Clearly, if a user needs to re-collateralise their vault then depositing stablecoins is the most effective way to do that. Stablecoin liquidity on Moonbeam is somewhat fragmented, therefore we will look to incentivise users to consolidate liquidity by minting dPRIME from a range of existing stablecoins by not levying fees or interest.
5. **Staking contract** To incentivise secondary market liquidity for dPRIME we intend to create a staking contract for holders of dPRIMEs, i.e. those who have deposited their dPRIME into a curve stableswap pool. Rewards will accrue to those partipating in the DAM staking contract.

Other key features:

1. **Accumulated rate** As with the MakerDAO protocol, we charge a variable interest rate, which compounds on a per second basis as a percentage of total borrowing. The existence of the interest rate -- which can be set to zero if necessary but cannot be negative -- is to manage the supply/demand curve for dPRIME and help with peg stability.
2. **Liquidations and auctions** Unhealthy vaults will be liquidated and auctioned off to keepers. We are using an adapted version of the MakerDAO (cat.sol)[https://github.com/makerdao/dss/blob/master/src/cat.sol] for our auction process. To incentivise liquidation a liquidation discount will be offered.
3. **Oracle price feeds** For delayed hourly updates to protfolio values.
4. **Accepted collateral** We can update the accepted collateral list. Add new collateral, remove existing collateral or update propeties of existing collateral types.
5. **Protocol-wide caps** As with other similar protocols we can set caps on the total debt limit (dPRIME issuance) as well as on each type of collateral.
6. **Protocol surplus and deficit** Any fees or interest payable by users credit the protocol surplus. Any bad debt which accrues as a result of auction shortfalls are accounted for as a protocol deficit. The existence of a deficit doesn't necessarily mean that dPRIME is undercollateralised -- as in the dPRIME value of the collateral is less the total amount of issued dPRIME. Instead, it means that dPRIME is *less* collateralised than it was before a deficit was recognised. Indeed, at the point a deficit is registered, the aggerate LTV for the protocol will increase. The surplus can be used by the stewards of the protocol in a variety of ways: to pay rewards to stakers, to plug the protocol's deficit.

## Documentation

Take a look at this [high level flow diagram](docs/High-level%20protocol%20flows.png) for an idea of how the protocol operates at a high-level and the various stakeholers which are involved. There is also a [function-call level diagram](docs/function%20level%20flow%20diagram.png) which shows how the contracts compose to form the entire protocol. In this diagram, it is worth noting that:

1. Contracts marked with an asterisk are not yet completed but we have included them i nthe diagram.
2. The staking contract has not yet been added to the diagram as we are still finalising the design.
3. We have also left of the individual permissioning admin functions (e.g.`rely` `deny`) for each of the anxillary contracts.

Contract specific documentation:

**[LMCV.sol](contracts/LMCV.sol) - The main accounting system for the protocol**

* Keeps track of how much collateral each user has deposited with the platform.
* Keeps track of how much collateral each user has committed to a vault.
* Keeps track of the debt balance / dPRIME issued to each user.
* Stores an accumulated stability rate to keep track of how much interest is payable on issued dPRIME.
* Provides an API for liquidations, as well as minting unbacked dPRIME or burning issued dPRIME.
* Provides an API for moving unlocked collateral or dPRIME between accounts.
* Admin interface for editing collateral types or and collateral information.

**[dPrime.sol](contracts/dPrime.sol) - for minting, burning and moving tokenized dPRIME**

* A Standard ERC20 contract based upon dai.sol.

**[CollateralJoin.sol](contracts/CollateralJoin.sol) - for depositing/withdrawing ERC20 tokens into the protocol**

* Based upon the join contracts from MakerDAO.
* Allows users to deposit or withdraw unlocked collateral. 

**[CollateralJoinDecimals.sol](contracts/CollateralJoinDecimals.sol) - for depositing/withdrawing ERC20 tokens into the protocol**

* As above but for stablecoins with a fewer number of precision digits.

**[dPrimeJoin.sol](contracts/dPrimeJoin.sol) - for depositing/withdrawing dPRIME into the protocol**

* Based upon the DAI join contract from MakerDAO.
* Allows users to deposit or withdraw unlocked dPRIME from the protocol. 

**[PSM.sol](contracts/PSM.sol) - for minting/burning dPrime 1:1 via other accepted stablecoins**

* Allows users to directly mint dPRIME 1:1 with other accepted stablecoins
* Calls join/exit and loan/repay directly on the collateral join contracts and the LMCV
* Optional mint and burn fee can be set
* dPRIME minted via the PSM counts as collateral towards the user's vault

**[WGLMR.sol](contracts/WGLMR.sol) - for wrapping the native token (Glimmer)**

* Saves us from having a separate join contract for Glimmer.
* Fairly standard design: deposit/withdraw/transfer/etc.

## Limitations / future features

1. In V1 no interest is payable on dPRIME deposits.
2. In V1 there is no governance token and therefore no decentralised governance or protocol enforced bail-ins/ bail-outs in the case of excessive protocol deficit.

## TODO

1. Liquidation contract
2. Auction contract
3. Staking contract
4. User facing proxy contract
5. Interest rate contract
6. Oracle price feed contracts

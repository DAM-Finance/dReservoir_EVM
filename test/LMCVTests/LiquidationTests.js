const {expect, assert} = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

// Token types.
let fooBytes = ethers.utils.formatBytes32String("FOO");
let barBytes = ethers.utils.formatBytes32String("BAR");
let bazBytes = ethers.utils.formatBytes32String("BAZ");

// Accounts.
let userOne, userTwo, treasury;

// Contracts and contract factories.
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz;
let liquidatorFactory, liquidator;
let auctionHouseFactory, auctionHouse;
let collateralJoinFactory, fooJoin, barJoin, bazJoin;

// LMCV settings.
let DEBT_CEILING = frad("50000");

// Mint a bunch of tokens and deposit some specified amount of them in the protocol.
async function setupUser(user, amounts) {
    let fooConnect = foo.connect(user);
    let barConnect = bar.connect(user);
    let bazConnect = baz.connect(user);

    await fooConnect.mint(fwad("1000"));
    await barConnect.mint(fwad("1000"));
    await bazConnect.mint(fwad("1000"));
    
    await fooConnect.approve(fooJoin.address);
    await barConnect.approve(barJoin.address);
    await bazConnect.approve(bazJoin.address);

    let fooJoinConnect = fooJoin.connect(user);
    let barJoinConnect = barJoin.connect(user);
    let bazJoinConnect = bazJoin.connect(user);

    await fooJoinConnect.join(user.address, fwad(amounts.at(0)));
    await barJoinConnect.join(user.address, fwad(amounts.at(1)));
    await bazJoinConnect.join(user.address, fwad(amounts.at(2)));
}

const NumType = Object.freeze({
    WAD: 18,
    RAY: 27,
    RAD: 45
});

let checkUint256Value = async (fun, val, units = NumType.WAD) => {
    expect(ethers.utils.formatUnits(await fun(), units)).to.be.equal(val);
}

describe("Liquidation testing", function () {

    before(async function () {
        dPrimeFactory           = await ethers.getContractFactory("dPrime");
        LMCVFactory             = await ethers.getContractFactory("LMCV");
        dPrimeJoinFactory       = await ethers.getContractFactory("dPrimeJoin");
        tokenFactory            = await ethers.getContractFactory("MockTokenTwo");
        collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
        liquidatorFactory       = await ethers.getContractFactory("Liquidator");
        auctionHouseFactory     = await ethers.getContractFactory("AuctionHouse");
        lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        // Get accounts for users.
        [userOne, userTwo, treasury] = await ethers.getSigners();

        // Deploy token contracts.
        foo = await tokenFactory.deploy("FOO");
        bar = await tokenFactory.deploy("BAR");
        baz = await tokenFactory.deploy("BAZ");

        // Deploy protocol contracts.
        dPrime          = await dPrimeFactory.deploy();
        lmcv            = await LMCVFactory.deploy();
        lmcvProxy       = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin      = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);
        fooJoin         = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, fooBytes, foo.address);
        barJoin         = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, barBytes, bar.address);
        bazJoin         = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, bazBytes, baz.address);
        auctionHouse    = await auctionHouseFactory.deploy(lmcv.address);
        liquidator      = await liquidatorFactory.deploy(lmcv.address);

        // Allow the collateral join contracts to call functions on LMCV.
        await lmcv.administrate(fooJoin.address, 1);
        await lmcv.administrate(barJoin.address, 1);
        await lmcv.administrate(bazJoin.address, 1);

        // Allow the liquidator to call functinos on LMCV.
        await lmcv.administrate(liquidator.address, 1);

        // Setup the LMCV.
        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);
        await lmcv.setTreasury(treasury.address);

        // Token Name, locked amount limit, dust level, credit ratio, liquidation discount, leveraged?
        await lmcv.editAcceptedCollateralType(fooBytes, fwad("1000"), fwad("1"), fray("0.7"), false);
        await lmcv.editAcceptedCollateralType(barBytes, fwad("1000"), fwad("1"), fray("0.6"), false);
        await lmcv.editAcceptedCollateralType(bazBytes, fwad("1000"), fwad("1"), fray("0.5"), false);

        // Set the market prices.
        await lmcv.updateSpotPrice(fooBytes, fray("7.61"));
        await lmcv.updateSpotPrice(barBytes, fray("0.58"));
        await lmcv.updateSpotPrice(bazBytes, fray("3.94"));

        // Permission liquidator to use auction house.
        await auctionHouse.rely(liquidator.address);

        //Permission AuctionHouse to move liquidator collateral.
        await liquidator.setAuctionHouse(auctionHouse.address);

        // Set up the users
        await setupUser(userOne, ["50", "800", "100"]);
        await setupUser(userTwo, ["250", "500", "750"]);
    });

    it("Liquidation where vault size is less than lot size", async function () {
        let userOneLMCV = lmcv.connect(userOne);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        //
        // FOO 50 x 7.61 x 0.7  = 266.35
        // BAR 800 x 0.58 x 0.6 = 278.4
        // BAZ 100 x 3.94 x 0.5 = 197
        //         credit limit = 741.75
        //
        //      portfolio value = 1,238.5
        //              max LTV = 59.89%
        // 
        // Withdrawing 500 dPRIME ...
        //
        //          current LTV = 40.37%
        //
        await userOneLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("800"), fwad("100")], fwad("500"), userOne.address);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, fooBytes),  "50.0",     NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, barBytes),  "800.0",    NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, bazBytes),  "100.0",    NumType.WAD);
        await checkUint256Value(() => userOneLMCV.dPrime(userOne.address),                      "500.0",    NumType.RAD);

        // shouldn't be able to liquidate this vault yet.
        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Vault within credit limit");

        // Price of BAR goes to 0.2 in an instant!
        //
        // FOO 50 x 7.61 x 0.7  = 266.35
        // BAR 800 x 0.2 x 0.6  = 32
        // BAZ 100 x 3.94 x 0.5 = 197
        //         credit limit = 495.35
        //     withdrawn dPRIME = 500
        //      portfolio value = 934.5
        //              max LTV = 53%   (credit limit / portfolio value)
        //          current LTV = 53.5% (withdrawn dPRIME / portfolio value)
        //
        await lmcv.updateSpotPrice(barBytes, fray("0.05"));

        // Now we can liquidate the vault.
        await liquidator.liquidate(userOne.address);

        // The user's remaining debt and collateral balances after liquidate is called.
        await checkUint256Value(() => userOneLMCV.normalizedDebt(userOne.address),              "0.0",      NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, fooBytes),  "0.0",      NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, barBytes),  "0.0",      NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, bazBytes),  "0.0",      NumType.WAD);

        // The debt up for auction is recorded as a protocol deficit.
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                 "500.0",    NumType.RAD);
        await checkUint256Value(() => lmcv.totalProtocolDeficit(),                              "500.0",    NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(liquidator.address),                  "0.0",      NumType.WAD);
        await checkUint256Value(() => lmcv.totalNormalizedDebt(),                               "0.0",      NumType.WAD);
    });

    it("Liquidation where vault size is greater than lot size", async function () {
        let userOneLMCV = lmcv.connect(userOne);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("300"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        //
        // FOO 50 x 7.61 x 0.7  = 266.35
        // BAR 800 x 0.58 x 0.6 = 278.4
        // BAZ 100 x 3.94 x 0.5 = 197
        //         credit limit = 741.75
        //
        //      portfolio value = 1,238.5
        //              max LTV = 59.89%
        // 
        // Withdrawing 500 dPRIME ...
        //
        //          current LTV = 40.37%
        //
        await userOneLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("800"), fwad("100")], fwad("500"), userOne.address);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, fooBytes),  "50.0",     NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, barBytes),  "800.0",    NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, bazBytes),  "100.0",    NumType.WAD);
        await checkUint256Value(() => userOneLMCV.dPrime(userOne.address),                      "500.0",    NumType.RAD);

        // shouldn't be able to liquidate this vault yet.
        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Vault within credit limit");

        // Price of BAR goes to 0.2 in an instant!
        //
        // FOO 50 x 7.61 x 0.7   = 266.35
        // BAR 800 x 0.05 x 0.6  = 24
        // BAZ 100 x 3.94 x 0.5  = 197
        //         credit limit  = 487.35
        //     withdrawn dPRIME  = 500
        //      portfolio value  = 814.5
        //              max LTV  = 59.83%   (credit limit / portfolio value)
        //          current LTV  = 61.38% (withdrawn dPRIME / portfolio value)
        //
        await lmcv.updateSpotPrice(barBytes, fray("0.05"));

        // Now we can liquidate the vault.
        await liquidator.liquidate(userOne.address);

        // The user's remaining debt and collateral balances after liquidate is called.
        await checkUint256Value(() => userOneLMCV.normalizedDebt(userOne.address),                "227.272727272727272728", NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, fooBytes),    "22.727272727272727273",  NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, barBytes),    "363.636363636363636365", NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, bazBytes),    "45.454545454545454546",  NumType.WAD);

        // The debt up for auction is recorded as a protocol deficit.
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                   "272.727272727272727272", NumType.RAD);
        await checkUint256Value(() => lmcv.totalProtocolDeficit(),                                "272.727272727272727272", NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userOne.address),                       "227.272727272727272728", NumType.WAD);
        await checkUint256Value(() => lmcv.totalNormalizedDebt(),                                 "227.272727272727272728", NumType.WAD);

        // The auction happens and no collateral is returned to the user. We can liquidate again...
        //
        // FOO 22.72 x 7.61 x 0.7  = 172.954
        // BAR 363.63 x 0.05 x 0.6 = 18.18
        // BAZ 45.45 x 3.94 x 0.5  = 179.09
        //         credit limit    = 221.522 
        //     withdrawn dPRIME    = 227.27
        //      portfolio value    = 370.227
        //              max LTV    = 59.83% (credit limit / portfolio value)
        //          current LTV    = 61.38% (withdrawn dPRIME / portfolio value)
        //
        // The vault has the same LTV as before as no collateral was returned. The vault should be empty
        // after calling liquidate again.
        await liquidator.liquidate(userOne.address);
        await checkUint256Value(() => userOneLMCV.normalizedDebt(userOne.address),                "0.0", NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, fooBytes),    "0.0", NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, barBytes),    "0.0", NumType.WAD);
        await checkUint256Value(() => userOneLMCV.lockedCollateral(userOne.address, bazBytes),    "0.0", NumType.WAD);

        // The debt up for auction is recorded as a protocol deficit.
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                   "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.totalProtocolDeficit(),                                "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(liquidator.address),                    "0.0", NumType.WAD);
        await checkUint256Value(() => lmcv.totalNormalizedDebt(),                                 "0.0", NumType.WAD);

    });

    it("Liquidate vault with no debt but has locked collateral should revert with within credit limit.", async function () {
        let userOneLMCV = lmcv.connect(userOne);

        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        userOneLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("800"), fwad("100")], fwad("0"), userOne.address);
        await checkUint256Value(() => userOneLMCV.normalizedDebt(userOne.address), "0.0", NumType.WAD);
        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Vault within credit limit");
    });

    it("Liquidate empty vault should revert with within credit limit.", async function () {
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Vault within credit limit");
    });

    it("Liquidator not set up should revert with not set up.", async function () {
        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Not set up");
    });

    it("Liquidation of an under-collateralised vault with small lotSize should succeed.", async function () {
        let userTwoLMCV = lmcv.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("250"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        await userTwoLMCV.loan([fooBytes], [fwad("100")], fwad("500"), userTwo.address);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, fooBytes),  "100.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.dPrime(userTwo.address),                      "500.0", NumType.RAD);

        // Vault becomes very unhealthy and gets liquidated.
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await liquidator.liquidate(userTwo.address);

        // There's not actually enough collateral to cover the debt.
        //
        // Collateral:     45.45 * 3     = 136.35
        // Debt:           250 / 1 / 1.1 = 227.27 (protocolDeficit).
        // Auction amount:               = 300.00 (Includes liquidation penalty).
        //
        // At auction, people will only bid up the dPRIME value of the collateral. This means there will be a dPRIME shortfall for
        // this auction. The vault can be liquidated again to claim the whole amount. The user will not get any collateral back and
        // the protocol will not get the 
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                   "227.272727272727272727",  NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userTwo.address),                     "272.727272727272727273",  NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address),                             "500.0",                   NumType.RAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, fooBytes),         "54.545454545454545455",   NumType.WAD);
        // Collateral gets moved from the liquidator contract to the auction house contract.
        await checkUint256Value(() => lmcv.unlockedCollateral(auctionHouse.address, fooBytes),  "45.454545454545454545",   NumType.WAD);
    });

    it("Full liquidation of an under-collateralised vault should succeed.", async function () {
        let userTwoLMCV = lmcv.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        await userTwoLMCV.loan([fooBytes], [fwad("100")], fwad("500"), userTwo.address);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, fooBytes),  "100.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.dPrime(userTwo.address),                      "500.0", NumType.RAD);

        // Vault becomes very unhealthy and gets liquidated.
        await lmcv.updateSpotPrice(fooBytes, fray("4.00"));
        await liquidator.liquidate(userTwo.address);

        // There's not actually enough collateral to cover the debt.
        //
        // Collateral: 100 * 4       = 400.0
        // Debt:                     = 500.0
        // Auction amount: 500 * 1.1 = 550.0
        //
        // At auction, people will only bid up the dPRIME value of the collateral. This means there will be a dPRIME shortfall for
        // this auction. The user will not get any collateral back.
        await checkUint256Value(() => lmcv.unlockedCollateral(auctionHouse.address, fooBytes),  "100.0", NumType.WAD);
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                   "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userTwo.address),                     "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address),                             "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, fooBytes),         "0.0",   NumType.WAD);
    });

    it("Full liquidation results in locked collateral list update.", async function () {
        let userTwoLMCV = lmcv.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        await userTwoLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("10"), fwad("10"), fwad("10")], fwad("50"), userTwo.address);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, fooBytes),  "10.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, barBytes),  "10.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, bazBytes),  "10.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.dPrime(userTwo.address),                      "50.0", NumType.RAD);

        // Vault becomes very unhealthy and gets liquidated.
        await lmcv.updateSpotPrice(fooBytes, fray("4.00"));
        await lmcv.updateSpotPrice(bazBytes, fray("2.00"));
        await liquidator.liquidate(userTwo.address);

        // At auction, people will only bid up the dPRIME value of the collateral. This means there will be a dPRIME shortfall for
        // this auction. The user will not get any collateral back.
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, fooBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, barBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, bazBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                "50.0",  NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userTwo.address),                  "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address),                          "50.0",  NumType.RAD);

        // There should be no collateral left in the lockedCollateralList as it was all liquidated.
        await expect(lmcv.lockedCollateralList(userTwo.address, 0)).to.be.reverted;
    });

    it("Adding more collateral after liqudiation works as expected.", async function () {
        let userTwoLMCV = lmcv.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // User one locks up all collateral and takes out a loan.
        await userTwoLMCV.loan([fooBytes], [fwad("10")], fwad("5"), userTwo.address);
        await checkUint256Value(() => userTwoLMCV.lockedCollateral(userTwo.address, fooBytes),  "10.0", NumType.WAD);
        await checkUint256Value(() => userTwoLMCV.dPrime(userTwo.address),                      "5.0",  NumType.RAD);

        // Vault becomes very unhealthy and gets liquidated.
        await lmcv.updateSpotPrice(fooBytes, fray("0.5"));
        await liquidator.liquidate(userTwo.address);

        // At auction, people will only bid up the dPRIME value of the collateral. This means there will be a dPRIME shortfall for
        // this auction. The user will not get any collateral back.
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, fooBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, barBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, bazBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                "5.0",   NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userTwo.address),                  "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address),                          "5.0",   NumType.RAD);

        // Should be no locked collateral now.
        await expect(lmcv.lockedCollateralList(userTwo.address, 0)).to.be.reverted;

        // Lock up some baz.
        await userTwoLMCV.loan([bazBytes], [fwad("10")], fwad("5"), userTwo.address);

        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, fooBytes),      "0.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userTwo.address, bazBytes),      "10.0",  NumType.WAD);
        await checkUint256Value(() => lmcv.protocolDeficit(treasury.address),                "5.0",   NumType.RAD);
        await checkUint256Value(() => lmcv.normalizedDebt(userTwo.address),                  "5.0",   NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address),                          "10.0",  NumType.RAD);
    });
});
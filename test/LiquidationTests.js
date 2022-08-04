const {expect} = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}

//Parse from wad,ray,rad
function pwad(bigNumber){ return bigNumber.div("1000000000000000000")}
function pray(bigNumber){ return bigNumber.div("1000000000000000000000000000")} 
function prad(bigNumber){ return bigNumber.div("1000000000000000000000000000000000000000000000")}

// Token types.
let fooBytes = ethers.utils.formatBytes32String("FOO");
let barBytes = ethers.utils.formatBytes32String("BAR");
let bazBytes = ethers.utils.formatBytes32String("BAZ");

// Accounts.
let userOne, userTwo;

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
        [userOne, userTwo] = await ethers.getSigners();

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
        auctionHouse    = await auctionHouseFactory.deploy();
        liquidator      = await liquidatorFactory.deploy(lmcv.address, auctionHouse.address);

        // Allow the collateral join contracts to call functions on LMCV.
        await lmcv.administrate(fooJoin.address, 1);
        await lmcv.administrate(barJoin.address, 1);
        await lmcv.administrate(bazJoin.address, 1);

        // Allow the liquidator to call functinos on LMCV.
        await lmcv.administrate(liquidator.address, 1);

        // Setup the LMCV.
        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);
        //await lmcv.setMintFee();
        //await lmcv.setTreasury();

        // Token Name, locked amount limit, dust level, credit ratio, liquidation discount, leveraged?
        await lmcv.editAcceptedCollateralType(fooBytes, fwad("1000"), fwad("1"), fray("0.7"), false);
        await lmcv.editAcceptedCollateralType(barBytes, fwad("1000"), fwad("1"), fray("0.6"), false);
        await lmcv.editAcceptedCollateralType(bazBytes, fwad("1000"), fwad("1"), fray("0.5"), false);

        // Set the market prices.
        await lmcv.updateSpotPrice(fooBytes, fray("7.61"));
        await lmcv.updateSpotPrice(barBytes, fray("0.58"));
        await lmcv.updateSpotPrice(bazBytes, fray("3.94"));

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
        userOneLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("800"), fwad("100")], fwad("500"), userOne.address);
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
        await checkUint256Value(() => lmcv.protocolDeficit(liquidator.address),                 "500.0",    NumType.RAD);
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
        userOneLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("800"), fwad("100")], fwad("500"), userOne.address);
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
        await checkUint256Value(() => lmcv.protocolDeficit(liquidator.address),                   "272.727272727272727272", NumType.RAD);
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
        checkUint256Value(() => lmcv.protocolDeficit(liquidator.address),                   "500.0", NumType.RAD);
        checkUint256Value(() => lmcv.totalProtocolDeficit(),                                "500.0", NumType.RAD);
        checkUint256Value(() => lmcv.normalizedDebt(liquidator.address),                    "0.0", NumType.WAD);
        checkUint256Value(() => lmcv.totalNormalizedDebt(),                                 "0.0", NumType.WAD);

    });
});


// describe("Liquidation function testing", function () {
//         it("Liquidation works with 50% liquidation", async function () {

//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


//             const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".5"));
//             // console.log(await liquidation.wait());

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
//         });

//         it("liquidates only partialLiqMax depsite user asking for more", async function () {

//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


//             const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1000000000")); 
//             // console.log(await liquidation.wait());

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
//         });

//         it("Liquidates a lower portion than partialLiqMax", async function () {

//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


//             const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25")); 
//             // console.log(await liquidation.wait());

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("810"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("9250"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2261.25"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("2261.25"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("2261.25"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("41.5625"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("83.125"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("166.25"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("41.5625"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("83.125"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("166.25"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("8.4375"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("16.875"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("33.75"));
//         });

//         it("Liquidates 100% of dPrime value because of high account insolvency percentage", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("19"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("38"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
//         });

//         it("Fails to liquidate because account is still healthy", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));
//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));

//             await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25"))).to.be.revertedWith("LMCV/Vault is healthy");
//         });

//         it("Can't liquidate because they don't have enough dPrime", async function () {

//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
//             await lmcv.pushLiquidationDPrime(addr3.address, frad("2000"));

//             await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1"))).to.be.revertedWith("LMCV/Not enough liquidation dPrime available");
//         });

//         it("Liquidates 100% of dPrime value because value lower than liq floor", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.setLiquidationFloor(frad("10000"));
//             await lmcv.setWholeCDPLiqMult(fray(".8"));

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("19"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("38"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
//         });

//         it("Removal of protocol fee because valueRatio got too high", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.setProtocolFeeRemovalMult(fray(".75"));

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("19"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("38"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
//         });

//         it("Insolvency percentage at 93.75%, liq fee at whatever is left and no protocol fee", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("12"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("3200"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1600"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3200"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("0"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("0"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("0"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
//         });

//         it("Insolvency percentage at 101.7%, liquidator takes a loss on the trade", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("3000"));

//             await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("9.5"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("2950"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1475"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("2950"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("0"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("0"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("0"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
//         });

//         it("Withdrawn dPrime hits 0 when full liquidation because withdrawDPrime < debtDPrime", async function () {
//             await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

//             await lmcv.administrate(dPrimeJoin.address, 1);
//             await dPrime.rely(dPrimeJoin.address);

//             let userDPrimeJoin = dPrimeJoin.connect(addr1);
//             await userLMCV.proxyApprove(userDPrimeJoin.address);
//             await userDPrimeJoin.exit(addr1.address, fwad("1500"));

//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("3000"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1500"));
            

//             await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
//             await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
//             expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
//             expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
//             expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

//             await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
//             await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

//             expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
//             expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
//             expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
//             expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
//             expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

//             expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
//             expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

//             let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
//             expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
//             let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
//             expect(collateralType2['totalDebt']).to.equal(fwad("19"));
//             let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
//             expect(collateralType3['totalDebt']).to.equal(fwad("38"));

//             expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
//             expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
//         });
//     });
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

        // Setup the LMCV.
        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);
        //await lmcv.setMintFee();
        //await lmcv.setTreasury();

        // Token Name, locked amount limit, dust level, credit ratio, liquidation discount, leveraged?
        await lmcv.editAcceptedCollateralType(fooBytes, fwad("1000"), fwad("1"), fray("0.7"), fray("0.08"), false);
        await lmcv.editAcceptedCollateralType(barBytes, fwad("1000"), fwad("1"), fray("0.6"), fray("0.08"), false);
        await lmcv.editAcceptedCollateralType(bazBytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"), false);

        await lmcv.updateSpotPrice(fooBytes, fray("7.61"));
        await lmcv.updateSpotPrice(barBytes, fray("0.58"));
        await lmcv.updateSpotPrice(bazBytes, fray("3.94"));

        // Set up the users
        await setupUser(userOne, ["50", "800", "100"]);
        await setupUser(userTwo, ["250", "500", "750"]);
    });

    it("Example test", async function () {
        let userOneLMCV = lmcv.connect(userOne);

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
        expect(await userOneLMCV.lockedCollateral(userOne.address, fooBytes)).to.equal(fwad("50"));
        expect(await userOneLMCV.lockedCollateral(userOne.address, barBytes)).to.equal(fwad("800"));
        expect(await userOneLMCV.lockedCollateral(userOne.address, bazBytes)).to.equal(fwad("100"));
        expect(await userOneLMCV.dPrime(userOne.address)).to.equal(frad("500"));

        // shouldn't be able to liquidate this vault yet.
        await expect(liquidator.liquidate(userOne.address)).to.be.revertedWith("Liquidator/Vault within credit limit");

        // Price of BAR goes to Zero in an instant!
        //
        // FOO 50 x 7.61 x 0.7  = 266.35
        // BAR 800 x 0 x 0.6    = 0
        // BAZ 100 x 3.94 x 0.5 = 197
        //         credit limit = 463.35
        //     withdrawn dPRIME = 500

        //      portfolio value = 741.75
        //              max LTV = 59.88% (credit limit / portfolio value)
        //          current LTV = 64.57% (withdrawn dPRIME / portfolio value)
        //
        await lmcv.updateSpotPrice(barBytes, fray("0.0"));

        console.log(await lmcv.CollateralData(barBytes));

        expect(await liquidator.liquidate(userOne.address));
    });
});

// IN CASE THE CASES ARE HELPFUL FOR THE LIQUIDATION MODULE


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
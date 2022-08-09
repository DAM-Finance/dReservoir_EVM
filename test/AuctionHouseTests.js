const {expect} = require("chai");
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

describe("AuctionHouse testing", function () {

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

        // Permission liquidator to use auction house.
        auctionHouse.rely(liquidator.address);

        //Permission AuctionHouse to move liquidator collateral.
        liquidator.setAuctionHouse(auctionHouse.address);

        // Set up the users
        await setupUser(userOne, ["50", "800", "100"]);
        await setupUser(userTwo, ["250", "500", "750"]);
    });

    it("Happy path auction test", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = liquidator.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLMCV.liquidate(userOne.address);

        // Check everything is as we expect.
        expect(await auctionHouse.auctions()).to.equal(1);
        let bidStruct = await auctionHouse.bids(1);
        console.log(bidStruct);
        console.log(bidStruct["lot"]);
        expect(ethers.utils.formatUnits(bidStruct["bid"], NumType.RAD)).to.be.equal("0.0");
        expect(ethers.utils.formatUnits(bidStruct["tab"], NumType.RAD)).to.be.equal("275.0");
        expect(bidStruct["guy"]).to.equal(liquidator.address);
        expect(bidStruct["usr"]).to.equal(userOne.address);
        let threeDays = 60 * 60 * 24 * 2;
        let blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        expect(bidStruct["end"]).to.equal(blockTimestamp + threeDays);
        expect(bidStruct["tic"]).to.be.equal(0);
        // expect(bidStruct["gal"]).to.equal(frad(0));      VOW or surplus/deficit account.
    });
});
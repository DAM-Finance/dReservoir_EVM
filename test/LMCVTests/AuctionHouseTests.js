const {expect} = require("chai");
const {ethers, network} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


// Token types.
let fooBytes = ethers.utils.formatBytes32String("FOO");
let barBytes = ethers.utils.formatBytes32String("BAR");
let bazBytes = ethers.utils.formatBytes32String("BAZ");

// Accounts.
let userOne, userTwo, userThree, treasury;

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
    
    await fooConnect.approve(fooJoin.address, MAX_INT);
    await barConnect.approve(barJoin.address, MAX_INT);
    await bazConnect.approve(bazJoin.address, MAX_INT);

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
        tokenFactory            = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
        liquidatorFactory       = await ethers.getContractFactory("Liquidator");
        auctionHouseFactory     = await ethers.getContractFactory("AuctionHouse");
        lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        // Get accounts for users.
        [userOne, userTwo, userThree, treasury] = await ethers.getSigners();

        // Deploy token contracts.
        foo = await tokenFactory.deploy("FOO");
        bar = await tokenFactory.deploy("BAR");
        baz = await tokenFactory.deploy("BAZ");

        // Deploy protocol contracts.
        dPrime          = await dPrimeFactory.deploy(ethers.constants.AddressZero);
        lmcv            = await LMCVFactory.deploy();
        lmcvProxy       = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin      = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);
        fooJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, fooBytes, foo.address);
        barJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, barBytes, bar.address);
        bazJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, bazBytes, baz.address);
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
        auctionHouse.rely(liquidator.address);

        //Permission AuctionHouse to move liquidator collateral.
        liquidator.setAuctionHouse(auctionHouse.address);

        // Set up the users
        await setupUser(userOne, ["50", "800", "100"]);
        await setupUser(userTwo, ["250", "500", "750"]);
    });

    //
    // -- Start auction tests ---
    //

    it("Liqudation to auction in start state", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLiquidator = liquidator.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Check everything is as we expect.
        expect(await auctionHouse.auctionId()).to.equal(1);

        // Lot list and values.
        let [lotList, lotValues] = await auctionHouse.lot(1);
        expect(lotList.length).to.equal(1);
        expect(lotValues.length).to.equal(1);
        expect(lotList[0]).to.equal(fooBytes);
        expect(ethers.utils.formatUnits(lotValues[0], NumType.WAD)).to.equal("50.0");

        // Bids and asking amount.
        let auctionStruct = await auctionHouse.auctions(1);
        expect(auctionStruct["currentWinner"]).to.equal(liquidator.address);
        expect(ethers.utils.formatUnits(auctionStruct["debtBid"], NumType.RAD)).to.be.equal("0.0");
        expect(ethers.utils.formatUnits(auctionStruct["askingAmount"], NumType.RAD)).to.be.equal("275.0");

        // Liquidated user and treasury.
        expect(auctionStruct["treasury"]).to.equal(treasury.address); 
        expect(auctionStruct["liquidated"]).to.equal(userOne.address);

        // bid and auction timeout.
        let twoDays = 60 * 60 * 24 * 2;
        let blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        expect(auctionStruct["auctionExpiry"]).to.equal(blockTimestamp + twoDays);
        expect(auctionStruct["bidExpiry"]).to.be.equal(0);
    });

    //
    // -- Stage one bidding tests ---
    //

    it("Bid too high", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Asking amount is 275, so a bid of 300 should fail.
        await expect(userTwoAuctionHouse.raise(1, frad("300.0"))).to.be.revertedWith("AuctionHouse/Bid higher than asking amount");
    });

    it("Insufficient dPRIME", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // UserTwo doesn't have any dPRIME.
        await expect(userTwoAuctionHouse.raise(1, frad("200.0"))).to.be.reverted;
    });

    it("Invalid auction id fails", async function () {
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction 2 doesn't exist.
        await expect(userTwoAuctionHouse.raise(2, frad("50.0"))).to.be.revertedWith("AuctionHouse/Highest bidder not set");
    });

    it("New bid must be higher than prior bid", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Initial bid.
        await userTwoAuctionHouse.raise(1, frad("100.0"));

        // Fails as lower than initial bid.
        await expect(userTwoAuctionHouse.raise(1, frad("50.0"))).to.be.revertedWith("AuctionHouse/Bid must be higher than current highest bid");
    });

    it("Bid equal to the asking amount succeeds", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Bid equal to asking amount should succeed.
        await userTwoAuctionHouse.raise(1, frad("275.0"));

        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
    });

    it("First bid can be any amount and should move dPRIME to treasury account", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));
        
        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("1.0"));

        // 50 dPRIME should move from user two to the treasury.
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "499.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "1.0", NumType.RAD);

        // Check auction values are updated as expected.
        let auctionStruct = await auctionHouse.auctions(1);
        expect(auctionStruct["currentWinner"]).to.equal(userTwo.address);
        expect(ethers.utils.formatUnits(auctionStruct["debtBid"], NumType.RAD)).to.be.equal("1.0");
        let threeHours = 60 * 60 * 3;
        let blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
        expect(auctionStruct["bidExpiry"]).to.be.equal(blockTimestamp + threeHours);
    });

    it("New highest bidder refunds prior highest bidder if different", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userThreeLMCV = lmcv.connect(userThree);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);
        let userThreeAuctionHouse = auctionHouse.connect(userThree);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);
        await userThreeLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two and three via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));
        await lmcv.inflate(treasury.address, userThree.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("50.0"));

        // 50 dPRIME should move from user two to the treasury.
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "450.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "50.0", NumType.RAD);

        // Second bid comes in. First bidder is refunded by second bidder.
        await userThreeAuctionHouse.raise(1, frad("75.0"));

        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "75.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "425.0", NumType.RAD);
    });

    it("If next highest bidder is the same then only send the incremental amount to treasury", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("10.0"));

        // 50 dPRIME should move from user two to the treasury.
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "490.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "10.0", NumType.RAD);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("25.0"));

        // 50 dPRIME should move from user two to the treasury.
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "475.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "25.0", NumType.RAD);
    });

    it("Can't place a bid after bid expiry", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Initial bid.
        await userTwoAuctionHouse.raise(1, frad("10.0"));

        // 10 dPRIME should move from user two to the treasury.
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "490.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "10.0", NumType.RAD);

        // Advancing time by three hours should enable us to 
        // end the auction because the bid expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 3]);

        // should fail as auction ended.
        await expect(userTwoAuctionHouse.raise(1, frad("25.0"))).to.be.revertedWith("AuctionHouse/Bid expiry reached");
    });

    it("Can't re-use an old auction.", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Initial bid.
        await userTwoAuctionHouse.raise(1, frad("10.0"));

        // Advancing time by four hours should enable us to 
        // end the auction because the bid expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 4]);

        // End the auction.
        await userTwoAuctionHouse.end(1);

        // Using the auction struct again should fail.
        await expect(userTwoAuctionHouse.raise(1, frad("25.0"))).to.be.revertedWith("AuctionHouse/Highest bidder not set");
    });

    it("Bid increase must be higher than minimumBidIncrease", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Initial bid.
        await userTwoAuctionHouse.raise(1, frad("100.0"));

        // Fails as lower than min bid increase.
        await expect(userTwoAuctionHouse.raise(1, frad("104.0"))).to.be.revertedWith("AuctionHouse/Insufficient increase");

        // 105 should work.
        await userTwoAuctionHouse.raise(1, frad("105.0"));
        let auctionStruct = await auctionHouse.auctions(1);
        expect(ethers.utils.formatUnits(auctionStruct["debtBid"], NumType.RAD)).to.be.equal("105.0");
    });

    //
    // --- Auction end tests ---
    //

    it("Auction can't conclude with no bids", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await expect(userTwoAuctionHouse.end(1)).to.be.revertedWith("AuctionHouse/Auction not finished");
    });

    it("Auction can't conclude until bid expiry is reached (if before auction expiry).", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("1.0"));

        // There is a bid but expiry times not reached yet.
        await expect(userTwoAuctionHouse.end(1)).to.be.revertedWith("AuctionHouse/Auction not finished");

        // Advancing time by three hours should enable us to 
        // end the auction because the bid expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 3]);
        await userTwoAuctionHouse.end(1);

        // User two should now have the collateral. User one should have lost it.
        // Treasury should have the 1.0 dPRIME paid for the collateral.
        // UserTwo had 250 foo to begin with.
        await checkUint256Value(() => lmcv.unlockedCollateral(userTwo.address, fooBytes), "300.0", NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userOne.address, fooBytes), "0.0", NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "499.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "1.0", NumType.RAD);

        // Auction 1 has been removed now, everything has been zeroed etc.
        // Gas cost of this???
        let auctionOne = await auctionHouse.auctions(1);
        expect(auctionOne["askingAmount"]).to.equal(0);
    });

    it("Auction can't conclude until auction expiry is reached (if before bid expiry).", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Set bid expiry to some enormously long time so we hit auction expiry first.
        await auctionHouse.setBidExpiry(10000);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("1.0"));

        // There is a bid but expiry times not reached yet.
        await expect(userTwoAuctionHouse.end(1)).to.be.revertedWith("AuctionHouse/Auction not finished");

        // Advancing time by two days should enable us to end
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);
        await userTwoAuctionHouse.end(1);

        // User two should now have the collateral. User one should have lost it.
        // Treasury should have the 1.0 dPRIME paid for the collateral.
        // UserTwo had 250 foo to begin with.
        await checkUint256Value(() => lmcv.unlockedCollateral(userTwo.address, fooBytes), "300.0", NumType.WAD);
        await checkUint256Value(() => lmcv.lockedCollateral(userOne.address, fooBytes), "0.0", NumType.WAD);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "499.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "1.0", NumType.RAD);

        // Auction 1 has been removed now, everything has been zeroed etc.
        // Gas cost of this???
        let auctionOne = await auctionHouse.auctions(1);
        expect(auctionOne["askingAmount"]).to.equal(0);
    });

    //
    // --- Auction restart tests ---
    //

    it("Auction can't be restarted before it has ended", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLiquidator = liquidator.connect(userTwo);

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Can't restart an auction which has not finished yet.
        await expect(auctionHouse.restart(1)).to.be.revertedWith("AuctionHouse/Auction not finished");

        // Advancing time by two days should enable us to restart
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);  

        // We should be able to restart the auction now.
        await auctionHouse.restart(1);
    });

    it("Auctions with bids cannot be restarted.", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Set bid expiry to some enormously long time so we hit auction expiry first.
        await auctionHouse.setBidExpiry(10000);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("1.0"));

        // Advancing time by two days should enable us to restart
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);  

        // Can't restart an auction which already has a bid
        await expect(auctionHouse.restart(1)).to.be.revertedWith("AuctionHouse/Bid already placed");
    });

    //
    // --- Converge phase tests ---
    //

    it("Converge phase starts only after asking amount reached in raise phase", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("5.0"));

        // Try bidding in phase two before the asking amount is raised.
        await expect(userTwoAuctionHouse.converge(1, fray("0.95"))).to.be.revertedWith("AuctionHouse/First phase not finished");
        
        // Bid full amount.
        await userTwoAuctionHouse.raise(1, frad("275.0"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
        
        // Submit bid to converge stage.
        await userTwoAuctionHouse.converge(1, fray("0.90"));
        // User gets 10% of the collateral back.
        await checkUint256Value(() => lmcv.unlockedCollateral(userOne.address, fooBytes), "5.0", NumType.WAD);
    });

    it("Can't converge on a past or invalid auction id", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("275.0"));

        // Advancing time by two days should enable us to end
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);
        await userTwoAuctionHouse.end(1);

        // Can't converge on finished auction.
        await expect(userTwoAuctionHouse.converge(1, fray("0.90"))).to.be.revertedWith("AuctionHouse/Highest bidder not set");
        // Can't converge on invalid auction.
        await expect(userTwoAuctionHouse.converge(2, fray("0.90"))).to.be.revertedWith("AuctionHouse/Highest bidder not set");
    });

    it("Can't converge after bid expiry", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Any initial bid amount is valid.
        await userTwoAuctionHouse.raise(1, frad("275.0"));

        // Advancing time by three hours should enable us to end
        // the auction because the bid expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 3]);

        // Can't converge on finished auction.
        await expect(userTwoAuctionHouse.converge(1, fray("0.90"))).to.be.revertedWith("AuctionHouse/Bid expiry reached");
    });

    it("Can't converge after auction expiry", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Advancing time by two days should enable us to end
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);

        // Can't converge on finished auction.
        await expect(userTwoAuctionHouse.converge(1, fray("0.90"))).to.be.revertedWith("AuctionHouse/Auction ended");
    });

    it("Lot Bid must be lower than prior.", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Bid full amount to progress to converge phase.
        await userTwoAuctionHouse.raise(1, frad("275.0"));
        
        // Start converge phase.
        await userTwoAuctionHouse.converge(1, fray("0.95"));
        // Not lower.
        await expect(userTwoAuctionHouse.converge(1, fray("0.98"))).to.be.revertedWith("AuctionHouse/collateralBid not lower");
    });

    it("Lot Bid must be more than 5% lower than prior.", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Bid full amount to progress to converge phase.
        await userTwoAuctionHouse.raise(1, frad("275.0"));
        
        // Submit bid to converge stage must be 95% or less.
        await expect(userTwoAuctionHouse.converge(1, fray("0.9501"))).to.be.revertedWith("AuctionHouse/Insufficient decrease");
        await userTwoAuctionHouse.converge(1, fray("0.95"));
        // Needs to be lower than 90.25% now.
        await expect(userTwoAuctionHouse.converge(1, fray("0.9026"))).to.be.revertedWith("AuctionHouse/Insufficient decrease");
        await userTwoAuctionHouse.converge(1, fray("0.9025"));
    });

    it("Correct dPRIME and collateral amounts are transferred.", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userThreeLMCV = lmcv.connect(userThree);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);
        let userThreeAuctionHouse = auctionHouse.connect(userThree);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);
        await userThreeLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two and three via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));
        await lmcv.inflate(treasury.address, userThree.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("3.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Bid full amount to progress to converge phase.
        await userTwoAuctionHouse.raise(1, frad("10.0"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "490.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "10.0", NumType.RAD);

        await userThreeAuctionHouse.raise(1, frad("50.0"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "450.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "50.0", NumType.RAD);

        await userTwoAuctionHouse.raise(1, frad("100.0"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "400.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "100.0", NumType.RAD);

        await userThreeAuctionHouse.raise(1, frad("275.0"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
        
        // Submit converge bids.
        await userTwoAuctionHouse.converge(1, fray("0.90"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
        await checkUint256Value(() => lmcv.unlockedCollateral(userOne.address, fooBytes), "5.0", NumType.WAD);

        await userThreeAuctionHouse.converge(1, fray("0.85"));
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
        await checkUint256Value(() => lmcv.unlockedCollateral(userOne.address, fooBytes), "7.5", NumType.WAD);

        // Advancing time by two days should enable us to end
        // the auction because the auction expiry time is reached.
        await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]);

        await userThreeAuctionHouse.end(1);
        await checkUint256Value(() => lmcv.dPrime(userTwo.address), "500.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(userThree.address), "225.0", NumType.RAD);
        await checkUint256Value(() => lmcv.dPrime(treasury.address), "275.0", NumType.RAD);
        await checkUint256Value(() => lmcv.unlockedCollateral(userOne.address, fooBytes), "7.5", NumType.WAD);
        await checkUint256Value(() => lmcv.unlockedCollateral(userThree.address, fooBytes), "42.5", NumType.WAD);
    });

    it("Raise phase won't accept bids under the minumum bid amount", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        await liquidator.setMinimumAskingPriceVariables(fray("0.25"), fray("0.8"), fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("7.14"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Collateral value is 7.14 * 50    = 357 dPRIME
        // debtHaircut is 250 * 1.1         = 275 dPRIME
        // Minimum bid is 257 * 0.8         = 178 dPRIME

        await expect(userTwoAuctionHouse.raise(1, frad("204.0"))).to.be.revertedWith("AuctionHouse/Bid lower than minimum bid");

        // This is greater than the minimum bid.
        await userTwoAuctionHouse.raise(1, frad("220.0"));
    });

    it("Can set minimum bid to zero", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.0"), fray("0.0"), fray("0.0"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("7.14"));
        await userTwoLiquidator.liquidate(userOne.address);

        // There should be no minimum bid.
        await userTwoAuctionHouse.raise(1, frad("1.0"));
    });

    it("Minimum bid amount is calculated as expected from collateral haircut", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.25"), fray("0.5"), fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("250"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("6.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Collateral value is 6.0 * 50     = 300 dPRIME
        // min bid as % of collatera lvalue = 75 dPRIME

        // Let's bid 74.9999 dPRiME
        await expect(userTwoAuctionHouse.raise(1, frad("74.9999"))).to.be.revertedWith("AuctionHouse/Bid lower than minimum bid");

        // 75 dPRIME will work.
        await userTwoAuctionHouse.raise(1, frad("75.0"));
    });

    it("Minimum bid amount is calculated as expected from debt haircut", async function () {
        let userOneLMCV = lmcv.connect(userOne);
        let userTwoLMCV = lmcv.connect(userTwo);
        let userTwoLiquidator = liquidator.connect(userTwo);
        let userTwoAuctionHouse = auctionHouse.connect(userTwo);

        // Auction house must be given approval to move dPRIME from participant's account.
        await userTwoLMCV.approve(auctionHouse.address);

        // Generate some dPRIME for user two via inflation. This is OK for testing.
        await lmcv.inflate(treasury.address, userTwo.address, frad("500.0"));

        // Set LTV for foo to a lower value. This means that there will be much more collateral than
        // debt and so we should calculate the minimum bid amount from the debt to be liquidated, rather
        // than the collateral to be sold.
        await lmcv.editCreditRatio(fooBytes, fray("0.4"));

        // Set up liquidator.
        await liquidator.setLotSize(fwad("1000"));
        await liquidator.setLiquidationPenalty(fray("1.1"));

        // Set up auction house.
        await liquidator.setMinimumAskingPriceVariables(fray("0.25"), fray("0.8"), fray("1.1"));

        // Prices goes lower and user gets liquidated.
        await userOneLMCV.loan([fooBytes], [fwad("50")], fwad("150"), userOne.address);
        await lmcv.updateSpotPrice(fooBytes, fray("6.00"));
        await userTwoLiquidator.liquidate(userOne.address);

        // Collateral value is 6.0 * 50     = 300 dPRIME
        // debtHaircut is 150 * 1.1         = 165 dPRIME
        // Minimum bid is 165 * 0.8         = 132 dPRIME

        // Let's bid 131.99 dPRiME
        await expect(userTwoAuctionHouse.raise(1, frad("131.99"))).to.be.revertedWith("AuctionHouse/Bid lower than minimum bid");

        // 132 dPRIME will work.
        await userTwoAuctionHouse.raise(1, frad("132.0"));
    });
});
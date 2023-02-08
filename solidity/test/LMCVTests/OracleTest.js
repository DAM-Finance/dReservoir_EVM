const {expect} = require("chai");
const { BigNumber } = require("ethers");
 const {ethers, network} = require("hardhat");

 //Format as wad, ray, rad
 function fwad(wad) { return ethers.utils.parseEther(wad) }
 function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
 function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

 // Token types.
 let fooBytes = ethers.utils.formatBytes32String("FOO");
 let barBytes = ethers.utils.formatBytes32String("BAR");
 let bazBytes = ethers.utils.formatBytes32String("BAZ");

 // Accounts.
 let userOne, userTwo, userThree, treasury;

 // Contracts and contract factories.
 let d2oFactory, d2o;
 let d2oJoinFactory, d2oJoin;
 let LMCVFactory, lmcv;
 let tokenFactory, foo, bar, baz;
 let collateralJoinFactory, fooJoin, barJoin, bazJoin;
 let priceUpdaterFactory, priceUpdater;
 let osmFactory, osm, userOneOSM;
 let oracleStubFactory, oracleStub;

 // LMCV settings.
 let DEBT_CEILING = frad("50000");
 const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

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
 

 describe("Oracle testing", function () {

    before(async function () {
        d2oFactory              = await ethers.getContractFactory("d2o");
        LMCVFactory             = await ethers.getContractFactory("LMCV");
        d2oJoinFactory          = await ethers.getContractFactory("d2oJoin");
        tokenFactory            = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");
        oracleStubFactory       = await ethers.getContractFactory("OracleStub");
        osmFactory              = await ethers.getContractFactory("OSM");
        priceUpdaterFactory     = await ethers.getContractFactory("PriceUpdater");
    });

    beforeEach(async function () {
        // Get accounts for users.
        [userOne, userTwo, userThree, treasury] = await ethers.getSigners();

        // Deploy token contracts.
        foo = await tokenFactory.deploy("FOO");
        bar = await tokenFactory.deploy("BAR");
        baz = await tokenFactory.deploy("BAZ");

        // Deploy protocol contracts.
        d2o             = await d2oFactory.deploy();
        lmcv            = await LMCVFactory.deploy();
        lmcvProxy       = await lmcvProxyFactory.deploy(lmcv.address);
        d2oJoin         = await d2oJoinFactory.deploy(lmcv.address, d2o.address, lmcvProxy.address);
        fooJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, fooBytes, foo.address);
        barJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, barBytes, bar.address);
        bazJoin         = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, bazBytes, baz.address);

        // Allow the collateral join contracts to call functions on LMCV.
        await lmcv.administrate(fooJoin.address, 1);
        await lmcv.administrate(barJoin.address, 1);
        await lmcv.administrate(bazJoin.address, 1);

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

        // Set up the users
        await setupUser(userOne, ["50", "800", "100"]);
        await setupUser(userTwo, ["250", "500", "750"]);
    });

     //
     // -- Start oracle tests ---
     //

    describe("OracleStub testing", function () {

        it("Can peek value", async function () {
            // Create an oracle.
            oracleStub = await oracleStubFactory.deploy("DOTUSD");

            // It's a DOT oracle.
            expect(await oracleStub.what()).to.equal("DOTUSD");

            // Value should be not set initially.
            let [val, set] = await oracleStub.peek();
            expect(val).to.equal(0);
            expect(set).to.equal(false);

            // After a poke the value should be set. This simulates some off-shain entity updating the oracle with a new price.
            await oracleStub.poke();
            let [valTwo, setTwo] = await oracleStub.peek();
            expect(valTwo.gt(BigNumber.from(fray("0")))).equals(true);
            expect(valTwo.lte(BigNumber.from(fray("1")))).equals(true); 
            expect(setTwo).to.equal(true);      
        });

    });
    
    describe("OSM testing", function () {

        beforeEach(async function () {
            // Create an oracle.
            oracleStub = await oracleStubFactory.deploy("DOTUSD");

            // Create the OSM pointing to the Oracle stub.
            osm = await osmFactory.deploy(oracleStub.address);

            // It's a DOT oracle.
            expect(await oracleStub.what()).to.equal("DOTUSD");

            // Permission a user to call peek and peep and get a handle to the contract.
            await osm.kiss(userOne.address);
            userOneOSM = osm.connect(userOne);
        });

        it("Poke twice. cur value should initially be nil until an hour passes and we poke again", async function () {
            // Update the oracle price.
            await oracleStub.poke();
            var [oracleValue, _] = await oracleStub.peek();

            // Anyone can poke the contract but user one does it for now.
            await userOneOSM.poke();

            // Get the latest price. It should still be zero.
            // expect(await userOneOSM.peek()).to.equal(0);
            var [val, has] = await userOneOSM.peek();
            expect(val).to.equal(0);
            expect(has).to.equal(false);

            var [val, has] = await userOneOSM.peep();
            expect(val).to.equal(oracleValue);
            expect(has).to.equal(true);

            // Fast forward one hour.
            await network.provider.send("evm_increaseTime", [60 * 60]);

            // Update the oracle price.
            await oracleStub.poke();

            // Get the price from the oracle again.
            await userOneOSM.poke();

            // Get the latest price. It should still be zero.
            var [val, has] = await userOneOSM.peek();
            expect(val).to.equal(oracleValue);
            expect(has).to.equal(true);

            // Re-assign oracleValue to the new value from the oracle.
            var [oracleValue, _] = await oracleStub.peek();

            var [val, has] = await userOneOSM.peep();
            expect(val).to.equal(oracleValue);
            expect(has).to.equal(true);
        });

        it("Poke only succeeds if the peek value is good.", async function () {
            // All of these are no-ops. Thte second call to poke should revert but 
            // doesn't as the initial oracle value is a zero.
            await userOneOSM.poke();
            await userOneOSM.poke();
        });

        it("Can't poke osm twice within a one hour period.", async function () {
            await oracleStub.poke();
            await userOneOSM.poke();
            await expect(userOneOSM.poke()).to.be.revertedWith("OSM/Called poke too soon");
        });

        it("Can't poke stopped OSM.", async function () {
            await oracleStub.poke();
            await userOneOSM.stop();
            await expect(userOneOSM.poke()).to.be.revertedWith("OSM/OSM is stopped");
        });

        it("Can restart stopped OSM.", async function () {
            // Stopping means we can't poke.
            await oracleStub.poke();
            await userOneOSM.stop();
            await expect(userOneOSM.poke()).to.be.revertedWith("OSM/OSM is stopped");

            // Restart and poke.
            await userOneOSM.start();
            await userOneOSM.poke();
            
            // Check value is good.
            var [oracleValue, _] = await oracleStub.peek();
            var [val, has] = await userOneOSM.peep();
            expect(val).to.equal(oracleValue);
            expect(has).to.equal(true);
        });

        it("Poke can be called on the hour, which doesn't necessarily mean and hour wait before the next call.", async function () {
            await oracleStub.poke();
            await userOneOSM.poke();

            // As soon as we call poke, zzz is set to the start of the last hour.
            let now = (await ethers.provider.getBlock("latest")).timestamp
            expect(await userOneOSM.zzz()).is.equal(now - (now % 3600));
            
            // Meaning that we can call poke again in 3600 - (now % 3600).
            let timeToNextCall = 3600 - (now % 3600);

            // This will fail as it's too soon.
            await expect(userOneOSM.poke()).to.be.revertedWith("OSM/Called poke too soon");

            // Fast forward time 100 seconds before the next hour. It will still fail.
            await network.provider.send("evm_increaseTime", [timeToNextCall - 100]);
            await expect(userOneOSM.poke()).to.be.revertedWith("OSM/Called poke too soon");

            // Now, it's time.
            await network.provider.send("evm_increaseTime", [100]);
            await userOneOSM.poke();
        });

    });

    describe("Price updater testing", function () {

        beforeEach(async function () {
            // Create an oracle.
            oracleStub = await oracleStubFactory.deploy("DOTUSD");

            // Create the OSM pointing to the Oracle stub.
            osm = await osmFactory.deploy(oracleStub.address);

            // It's a DOT oracle.
            expect(await oracleStub.what()).to.equal("DOTUSD");

            // Permission a user to call peek and peep and get a handle to the contract.
            await osm.kiss(userOne.address);
            userOneOSM = osm.connect(userOne);

            priceUpdater = await priceUpdaterFactory.deploy(lmcv.address);

            // Permission the price updater to call peek on the OSM.
            await osm.kiss(priceUpdater.address);

            // Permission the PriceUpdater to update collateral spot prices.
            await lmcv.administrate(priceUpdater.address, 1);
        });

        it("Can update address for OSM, poke it and receive an updated collateral price", async function () {
            // Update the oracle address for foo collateral.
            await priceUpdater.updateSource(fooBytes, osm.address);
            let userOnePriceUpdater = priceUpdater.connect(userOne);

            // Generate a new value in the Oracle, fast forward and try again.
            // This is so there is a current value in the OSM.
            await oracleStub.poke();
            await userOneOSM.poke();
            await network.provider.send("evm_increaseTime", [3600]);
            await userOneOSM.poke();

            // Get the oracle value so we can compare with the value in the LMCV.
            var [val, _] = await userOneOSM.peek();

            // User one now calls update price on the price updater.
            await userOnePriceUpdater.updatePrice(fooBytes);

            // Check the price updated.
            let collateralType = await lmcv.CollateralData(fooBytes);
            expect(collateralType['spotPrice']).to.equal(val);
        });
    });

});
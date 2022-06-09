const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, mockToken;
let collateralJoinFactory, collateralJoin;
let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let mockToken2Bytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let mockToken3Bytes = ethers.utils.formatBytes32String("MOCKTOKENTHREE");
let tokenTwo, tokenThree;
let collatJoinTwo, collatJoinThree;
let collateralBytesList = [mockTokenBytes, mockToken2Bytes, mockToken3Bytes];
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;


//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}
//Parse from wad,ray,rad
function pwad(bigNumber){ return bigNumber.div("1000000000000000000")}
function pray(bigNumber){ return bigNumber.div("1000000000000000000000000000")} 
function prad(bigNumber){ return bigNumber.div("1000000000000000000000000000000000000000000000")}

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address);
    await mockToken2Connect.approve(collatJoinTwo.address);
    await mockToken3Connect.approve(collatJoinThree.address);

    await mockTokenConnect.mint(fwad("1000"));
    await mockToken2Connect.mint(fwad("1000"));
    await mockToken3Connect.mint(fwad("1000"));

    let collatJoinConnect = collateralJoin.connect(addr);
    await collatJoinConnect.join(addr.address, fwad(amounts.at(0)));

    let collatJoin2Connect = collatJoinTwo.connect(addr);
    await collatJoin2Connect.join(addr.address, fwad(amounts.at(1)));

    let collatJoin3Connect = collatJoinThree.connect(addr);
    await collatJoin3Connect.join(addr.address, fwad(amounts.at(2)));
}

describe("Testing LMCV", function () {

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        LMCVFactory = await ethers.getContractFactory("LMCV");
        lmcv = await LMCVFactory.deploy();

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, owner.address, fray("0.01"));

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, mockToken2Bytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, mockToken3Bytes, tokenThree.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await lmcv.setPartialLiqMax(fray(".50"));
        await lmcv.setProtocolLiqFeeMult(fray(".015"));
        await lmcv.setLiquidationMult(fray(".60"));
        await lmcv.setLiquidationFloor(frad("10"));
        await lmcv.setWholeCDPLiqMult(fray(".75"));
        await lmcv.setProtocolFeeRemovalMult(fray(".92"));
        

        await setupUser(addr1, ["555", "666", "777"]);
        await setupUser(addr2, ["1000", "1000", "1000"]);
        await setupUser(addr3, ["0", "0", "0"]);

        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
        await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));

        await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
        await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);
    });

    describe("Loan function testing", function () {
        
        let inconsequentialAmounts = [fwad("50"), fwad("50"), fwad("50")];
        beforeEach(async function () {
            userLMCV = await lmcv.connect(addr1);
        });

        it("Should break if collateral change > unlockedCollateral amount", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, [fwad("600"), fwad("600"), fwad("600")], fwad("100"), addr1.address)
            ).to.be.reverted;
        });

        it("Should break if collateral list has different size than collateralChange size", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, [], fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Need amount for each collateral");
        });

        it("Should break if user doesn't consent", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr2.address)
            ).to.be.revertedWith("LMCV/Owner must consent");
        });

        it("Should break for unrecognized collateral type", async function () {
            await expect(
                userLMCV.loan(collateralBytesList.concat([ethers.utils.formatBytes32String("NOTIMPL")]), inconsequentialAmounts.concat([fwad("50")]), fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/collateral type not initialized");
        });

        it("Should break if user doesn't consent", async function () {
            await lmcv.collatDebtFloor(mockToken3Bytes, fwad("51"));
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Collateral must be higher than dust level");
            await lmcv.collatDebtFloor(mockToken3Bytes, fwad("1"));
        });

        it("Should break if collateral's debt ceiling is exceeded", async function () {
            await lmcv.collatDebtCeiling(mockToken3Bytes, fwad("49"));
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Collateral debt ceiling exceeded");
            await lmcv.collatDebtCeiling(mockToken3Bytes, fwad("1000"));
        });

        it("Should break if minting more dPrime than allowed from collateral", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("100000"), addr1.address)
            ).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });

        it("Should break if minting more dPrime than protocol debt ceiling", async function () {
            await lmcv.setProtocolDebtCeiling("50000000000000000000000000000000000000000000000"); // [rad] $50
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("51"), addr1.address)
            ).to.be.revertedWith("LMCV/Cannot extend past protocol debt ceiling");
            await lmcv.setProtocolDebtCeiling(debtCeiling);
        });

        it("Should behave correctly when given collateral", async function () {
            //Total value of collateral: $6000 
            //Total loanable amount: $3000
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockTokenBytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 2)).to.equal(mockToken3Bytes);

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("505"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal("2000000000000000000000000000000000000000000000000");

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("50"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("100"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("200"));

            expect(await lmcv.ProtocolDebt()).to.equal("2000000000000000000000000000000000000000000000000");
        });

        it("Should behave correctly when given collateral a second time", async function () {
            //Second loan with more collateral and more dPrime
            //Total value of collateral: $6000 + $7000
            //Total loanable amount: $3000 + $3500
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            await userLMCV.loan(collateralBytesList, [fwad("100"), fwad("100"), fwad("100")], fwad("1000"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockTokenBytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 2)).to.equal(mockToken3Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 4)).to.be.reverted;

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("405"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("466"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("477"));
            
            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("150"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("200"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("300"));

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal("3000000000000000000000000000000000000000000000000");

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("150"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("200"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("300"));

            expect(await lmcv.ProtocolDebt()).to.equal("3000000000000000000000000000000000000000000000000");
        });

        it("Should behave correctly for second account", async function () {
            
            //Second loan with more collateral and more dPrime
            //Total value of collateral: $6610
            //Total loanable amount: $3305
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            await userLMCV.loan(collateralBytesList, [fwad("100"), fwad("100"), fwad("100")], fwad("1000"), addr1.address);
            await userTwoLMCV.loan(collateralBytesList, [fwad("88"), fwad("99"), fwad("111")], fwad("1475"), addr2.address);

            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 0)).to.equal(mockTokenBytes);
            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 1)).to.equal(mockToken2Bytes);
            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 2)).to.equal(mockToken3Bytes);
            await expect(userTwoLMCV.lockedCollateralList(addr2.address, 4)).to.be.reverted;

            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockTokenBytes)).to.equal(fwad("912"));
            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockToken2Bytes)).to.equal(fwad("901"));
            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockToken3Bytes)).to.equal(fwad("889"));
            
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockTokenBytes)).to.equal(fwad("88"));
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockToken2Bytes)).to.equal(fwad("99"));
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockToken3Bytes)).to.equal(fwad("111"));

            expect(await userTwoLMCV.debtDPrime(addr2.address)).to.equal("1475000000000000000000000000000000000000000000000");

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("411"));

            expect(await lmcv.ProtocolDebt()).to.equal("4475000000000000000000000000000000000000000000000");
        });

        it("Should behave correctly when given no collateral and more dPrime taken out", async function () {
            //Second loan with more dPrime
            //Total value of collateral: $6610
            //Total loanable amount: $3305
            //Already loaned: $1475
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            await userLMCV.loan(collateralBytesList, [fwad("100"), fwad("100"), fwad("100")], fwad("1000"), addr1.address);
            await userTwoLMCV.loan(collateralBytesList, [fwad("88"), fwad("99"), fwad("111")], fwad("1475"), addr2.address);
            await userTwoLMCV.loan(collateralBytesList, [fwad("0"), fwad("0"), fwad("0")], fwad("1000"), addr2.address);

            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 0)).to.equal(mockTokenBytes);
            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 1)).to.equal(mockToken2Bytes);
            expect(await userTwoLMCV.lockedCollateralList(addr2.address, 2)).to.equal(mockToken3Bytes);
            await expect(userTwoLMCV.lockedCollateralList(addr2.address, 4)).to.be.reverted;

            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockTokenBytes)).to.equal(fwad("912"));
            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockToken2Bytes)).to.equal(fwad("901"));
            expect(await userTwoLMCV.unlockedCollateral(addr2.address, mockToken3Bytes)).to.equal(fwad("889"));
            
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockTokenBytes)).to.equal(fwad("88"));
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockToken2Bytes)).to.equal(fwad("99"));
            expect(await userTwoLMCV.lockedCollateral(addr2.address, mockToken3Bytes)).to.equal(fwad("111"));

            expect(await userTwoLMCV.debtDPrime(addr2.address)).to.equal("2475000000000000000000000000000000000000000000000");

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("411"));

            expect(await lmcv.ProtocolDebt()).to.equal("5475000000000000000000000000000000000000000000000");
        });

        it("Should break when more collateral taken out than allowed from multiple transactions", async function () {
            //Third loan with more dPrime
            //Total value of collateral: $6610
            //Total loanable amount: $3305
            //Already taken out: $2475
            await expect(userTwoLMCV.loan(collateralBytesList, [fwad("0"), fwad("0"), fwad("0")], fwad("1000"), addr2.address)).to.be.reverted;
        });

        // TODO: Case where dust level has changed in between modification of dPrime
        it("When dust level is set to be above loan's collateral amount for specific token, refuses new loan when token included", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await expect(userTwoLMCV.loan(collateralBytesList, [fwad("10"), fwad("10"), fwad("10")], fwad("100"), addr2.address)).to.be.revertedWith("LMCV/Collateral must be higher than dust level");
        });

        it("When dust level is set to be above loan's collateral amount for specific token, allows higher loan when that token is not included", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await userLMCV.loan([mockTokenBytes, mockToken3Bytes], [fwad("0"), fwad("0")], fwad("100"), addr1.address);
            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("140"));
        });

        it("When dust level is set to be above loan's collateral amount for specific token, puts CDP in unhealthy state and denies more dPrime loan", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1950"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.loan([mockTokenBytes, mockToken3Bytes], [fwad("0"), fwad("0")], fwad("100"), addr1.address)).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });
    });

    describe("AddLoanedDPrime", function () {
        it("Should break if minting more dPrime than allowed from collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await expect(
                userLMCV.addLoanedDPrime(addr1.address, frad("100000"))
            ).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });

        it("Should break if minting more dPrime than protocol debt ceiling", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.setProtocolDebtCeiling(frad("50")); // [rad] $50
            await expect(
                userLMCV.addLoanedDPrime( addr1.address, frad("51"))
            ).to.be.revertedWith("LMCV/Cannot extend past protocol debt ceiling");
            await lmcv.setProtocolDebtCeiling(debtCeiling);
        });

        it("Should work if everything filled in properly and below maxDPrime", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await userLMCV.addLoanedDPrime(addr1.address, frad("1000"));
            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("1040"));
        });

        it("When dust level is set to be above loan amount, this leads to no extra dPrime being loanable", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1999"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.addLoanedDPrime(addr1.address, frad("1"))).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });

        
    });

    describe("Repay function testing", function () {
        it("Should succeed when given a collateral and an appropriate amount of dPrime back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            
            //repay one collateral
            await userLMCV.repay([mockTokenBytes], [fwad("50")], fwad("500"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockToken3Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 2)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("277"));

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("555"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));
        });

        it("Should succeed when given all collateral and all dPrime back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            
            //repay full collateral amount
            await userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 0)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(0);
        });

        it("Should succeed in repaying most of the collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("8"));

            await userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("760"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("17"));
            expect(await userLMCV.withdrawnDPrime(addr1.address)).to.equal(frad("8"));
        });

        it("Should be able to repay with all dPrime user has after protocol fee", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("777"));
            await userDPrimeJoin.join(addr1.address, fwad("769"));
            
            // //repay a collateral amount
            await userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("769"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("8"));
            expect(await userLMCV.withdrawnDPrime(addr1.address)).to.equal(frad("8"));
        });

        it("Should succeed when given a collateral and an appropriate amount of dPrime back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            
            //repay one collateral
            await userLMCV.repay([mockTokenBytes, mockTokenBytes], [fwad("25"),fwad("25")], fwad("500"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockToken3Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 2)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.debtDPrime(addr1.address)).to.equal(frad("277"));

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("555"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));
        });
        

        it("Should fail when not repaying amount of dPrime needed to unlock collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/More dPrime left than allowed");
        });

        it("Should fail when collateral list isn't the same size as change list", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/Need amount for each collateral");
        });

        it("Should fail when owner doesn't consent", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            await expect(
                userTwoLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/Owner must consent");
        });

        it("Should fail when debtDPrime will be lower than withdrawn dPrime", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("777"));
            await userDPrimeJoin.join(addr1.address, fwad("600"));

            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("177"));
            
            // //repay a collateral amount
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("601"), addr1.address)
            ).to.be.revertedWith("LMCV/Cannot have more withdrawn dPrime than debt");
        });
    });

    describe("Liquidation function testing", function () {
        it("Liquidation works with 50% liquidation", async function () {

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));


            const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".5"));
            // console.log(await liquidation.wait());

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
        });

        it("liquidates only partialLiqMax depsite user asking for more", async function () {

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));


            const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1000000000")); 
            // console.log(await liquidation.wait());

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
        });

        it("Liquidates a lower portion than partialLiqMax", async function () {

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));


            const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25")); 
            // console.log(await liquidation.wait());

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("810"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("9250"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2261.25"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("2261.25"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("2261.25"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("41.5625"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("83.125"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("166.25"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("41.5625"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("83.125"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("166.25"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("8.4375"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("16.875"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("33.75"));
        });

        it("Liquidates 100% of dPrime value because of high account insolvency percentage", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));
            await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("19"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("38"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
        });

        it("Fails to liquidate because account is still healthy", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));
            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));

            await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25"))).to.be.revertedWith("LMCV/Vault is healthy");
        });

        it("Can't liquidate because they don't have enough dPrime", async function () {

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
            await lmcv.modifyLiquidationDPrime(addr3.address, frad("2000"));

            await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1"))).to.be.revertedWith("LMCV/Not enough liquidation dPrime available");
        });

        it("Liquidates 100% of dPrime value because value lower than liq floor", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.setLiquidationFloor(frad("10000"));
            await lmcv.setWholeCDPLiqMult(fray(".8"));

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));
            await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("19"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("38"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
        });

        it("Removal of protocol fee because valueRatio got too high", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.setProtocolFeeRemovalMult(fray(".75"));

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));
            await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("19"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("38"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
        });

        it("Insolvency percentage at 93.75%, liq fee at whatever is left and no protocol fee", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
            await lmcv.updateSpotPrice(mockToken2Bytes, fray("12"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("3200"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1600"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));
            await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3200"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("0"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("0"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("0"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
        });

        it("Insolvency percentage at 101.7%, liquidator takes a loss on the trade", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("3000"));

            await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
            await lmcv.updateSpotPrice(mockToken2Bytes, fray("9.5"));
            await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
            expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("2950"));
            expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1475"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

            await lmcv.modifyLiquidationDPrime(addr3.address, frad("10000"));
            await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

            expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("2950"));
            expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
            expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("0"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("0"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("0"));

            expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
        });
    });

    // describe("isHealthy function testing", function () {
    //     it("When dust level is set to be above loan amount, this leads to unhealthy account", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2500"), addr1.address);
    //         await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
    //     });

    //     it("When dust level is set to be above loan amount, this leads to unhealthy account", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2900"), addr1.address);
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
    //     });
    // });
});


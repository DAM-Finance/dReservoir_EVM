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
let lmcvProxy, lmcvProxyFactory;


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

    before(async function () {
        dPrimeFactory = await ethers.getContractFactory("dPrime");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrime = await dPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address, owner.address, fray("0.01"));

        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockTokenBytes, mockToken.address, 18);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken2Bytes, tokenTwo.address, 18);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken3Bytes, tokenThree.address, 18);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);
        await lmcv.setLiquidationMult(fray(".60"));
        
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

    describe("Loan() testing", function () {
        
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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("2000"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("50"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("100"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("200"));

            expect(await lmcv.dPrimeTotalDebt()).to.equal(frad("2000"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("2000"));
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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("3000"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("150"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("200"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("300"));

            expect(await lmcv.dPrimeTotalDebt()).to.equal(frad("3000"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("3000"));
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

            expect(await userTwoLMCV.normalDebt(addr2.address)).to.equal(fwad("1475"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("411"));

            expect(await lmcv.dPrimeTotalDebt()).to.equal(frad("4475"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("4475"));
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

            expect(await userTwoLMCV.normalDebt(addr2.address)).to.equal(fwad("2475"));

            let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
            expect(collateralType['totalDebt']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
            expect(collateralType2['totalDebt']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
            expect(collateralType3['totalDebt']).to.equal(fwad("411"));

            expect(await lmcv.dPrimeTotalDebt()).to.equal(frad("5475"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("5475"));
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
            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("140"));
        });

        it("When dust level is set to be above loan's collateral amount for specific token, puts CDP in unhealthy state and denies more dPrime loan", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1950"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.loan([mockTokenBytes, mockToken3Bytes], [fwad("0"), fwad("0")], fwad("100"), addr1.address)).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });
    });

    describe("AddLoanedDPrime() tests", function () {
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
                userLMCV.addLoanedDPrime( addr1.address, fwad("51"))
            ).to.be.revertedWith("LMCV/Cannot extend past protocol debt ceiling");
            await lmcv.setProtocolDebtCeiling(debtCeiling);
        });

        it("Should work if everything filled in properly and below maxDPrime", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await userLMCV.addLoanedDPrime(addr1.address, fwad("1000"));
            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("1040"));
        });

        it("When dust level is set to be above loan amount, this leads to no extra dPrime being loanable", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1999"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.addLoanedDPrime(addr1.address, frad("1"))).to.be.revertedWith("LMCV/Minting more dPrime than allowed");
        });
    });

    describe("Repay() testing", function () {
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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("277"));

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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(0);
        });

        it("Should succeed in repaying most of the collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1000"), addr1.address);

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("1000"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("1000"));

            await lmcv.administrate(dPrimeJoin.address, 1);
            await dPrime.rely(dPrimeJoin.address);

            let userDPrimeJoin = dPrimeJoin.connect(addr1);
            await userLMCV.proxyApprove(userDPrimeJoin.address);
            await userDPrimeJoin.exit(addr1.address, fwad("50"));

            await userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("900"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("100"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("50"));
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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("8"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("0"));
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

            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("277"));

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("555"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));
        });
        

        it("Should fail when not repaying amount of dPrime needed to unlock collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1000"), addr1.address);

            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1000"));
            expect(await lmcv.normalDebt(addr1.address)).to.equal(fwad("1000"));

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

            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("600"));
            
            // //repay a collateral amount
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("601"), addr1.address)
            ).to.be.revertedWith("VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)");
        });
    });

    describe("isHealthy function testing", function () {
        it("When dust level is set to be above loan amount, this leads to unhealthy account", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2500"), addr1.address);
            await lmcv.collatDebtFloor(mockToken2Bytes, fwad("120"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
        });

        it("When dust level is set to be above loan amount, this leads to unhealthy account", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2900"), addr1.address);
            expect(await lmcv.getMaxDPrimeDebt(addr1.address)).to.equal(frad("3000"));

            await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
            expect(await lmcv.getMaxDPrimeDebt(addr1.address)).to.equal(frad("2400"));
            expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
        });
    });

    describe("Mint Fee testing", function () {
        it("Mint fee should behave correctly when 2 loans taken out at different stability rates", async function () {

            await lmcv.setMintFee(fray(".0025"));

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await userLMCV.normalDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("1995"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("5"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.StabilityRate()).to.equal(fray("1.1"));

            expect(await lmcv.dPrime(owner.address)).to.equal(frad("205"));

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("4189.5"));
            expect(await lmcv.normalDebt(addr1.address)).to.equal(fwad("4000"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("210.5"));


            await userTwoLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr2.address);
            expect(await userTwoLMCV.normalDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await userTwoLMCV.dPrime(addr2.address)).to.equal(frad("2194.5"));

            await userTwoLMCV.moveDPrime(addr2.address, addr1.address, frad("2194.5"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("6384"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.StabilityRate()).to.equal(fray("1.2"));

            expect(await lmcv.dPrime(owner.address)).to.equal(frad("816"));

            await userLMCV.repay(collateralBytesList, [fwad("100"), fwad("200"), fwad("400")], fwad("4000"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1584"));
            expect(await lmcv.normalDebt(addr1.address)).to.equal(0);
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("2000"));
        });
    });

    //TODO: Minting fee in LMCV Tests
});


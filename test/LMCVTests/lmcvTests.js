const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let d2OFactory, d2O;
let d2OJoinFactory, d2OJoin;
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
let liquidator, liquidatorLMCV;


//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}
//Parse from wad,ray,rad
function pwad(bigNumber){ return bigNumber.div("1000000000000000000")}
function pray(bigNumber){ return bigNumber.div("1000000000000000000000000000")} 
function prad(bigNumber){ return bigNumber.div("1000000000000000000000000000000000000000000000")}

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address, MAX_INT);
    await mockToken2Connect.approve(collatJoinTwo.address, MAX_INT);
    await mockToken3Connect.approve(collatJoinThree.address, MAX_INT);

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
        d2OFactory = await ethers.getContractFactory("d2O");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        d2OJoinFactory = await ethers.getContractFactory("d2OJoin");
        tokenFactory = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        d2O = await d2OFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        d2OJoin = await d2OJoinFactory.deploy(lmcv.address, d2O.address, lmcvProxy.address);

        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, "0x6961D457fA5DBc3968DFBeD0b2df2D0954332a01", mockTokenBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, "0x6961D457fA5DBc3968DFBeD0b2df2D0954332a01", mockToken2Bytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, "0x6961D457fA5DBc3968DFBeD0b2df2D0954332a01", mockToken3Bytes, tokenThree.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await setupUser(addr1, ["555", "666", "777"]);
        await setupUser(addr2, ["1000", "1000", "1000"]);
        await setupUser(addr3, ["0", "0", "0"]);

        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), false);

        await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
        await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);

        liquidator = await ethers.getSigner();
        liquidatorLMCV = lmcv.connect(liquidator);
    });

    describe("Loan() testing", function () {

        let inconsequentialAmounts = [fwad("50"), fwad("50"), fwad("50")];
        beforeEach(async function () {
            userLMCV = await lmcv.connect(addr1);
        });

        it("Cannot have no admin on LMCV", async function () {
            await expect(
                lmcv.administrate(owner.address, 0)
            ).to.be.revertedWith("LMCV/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        });

        it("Cannot lock more collateral than available unlocked balance", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, [fwad("600"), fwad("600"), fwad("600")], fwad("100"), addr1.address)
            ).to.be.reverted;
        });

        it("Loan must be called with the collaterlList and collateralChange parameters of equal list length", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, [], fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Missing collateral type or collateral amount");
        });

        it("Should break if user doesn't consent", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr2.address)
            ).to.be.revertedWith("LMCV/Owner must consent");
        });

        it("Should break for unrecognized collateral type", async function () {
            await expect(
                userLMCV.loan(collateralBytesList.concat([ethers.utils.formatBytes32String("NOTIMPL")]), inconsequentialAmounts.concat([fwad("50")]), fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Collateral data not initialized");
        });

        it("Locked collateral amounts must be higher than dust level", async function () {
            await lmcv.editDustLevel(mockToken3Bytes, fwad("51"));
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Locked collateral amount must be higher than dust level");
            await lmcv.editDustLevel(mockToken3Bytes, fwad("1"));
        });

        it("Should break if collateral's locked amount limit is exceeded", async function () {
            await lmcv.editLockedAmountLimit(mockToken3Bytes, fwad("49"));
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("10"), addr1.address)
            ).to.be.revertedWith("LMCV/Maximum protocol collateral amount exceeded");
            await lmcv.editLockedAmountLimit(mockToken3Bytes, fwad("1000"));
        });

        it("Should break if minting more d2O exceeds the maximum credit limit", async function () {
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("100000"), addr1.address)
            ).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });

        it("Should break if minting more d2O than protocol debt ceiling", async function () {
            await lmcv.setProtocolDebtCeiling("50000000000000000000000000000000000000000000000"); // [rad] $50
            await expect(
                userLMCV.loan(collateralBytesList, inconsequentialAmounts, fwad("51"), addr1.address)
            ).to.be.revertedWith("LMCV/Cannot extend past protocol debt ceiling");
            await lmcv.setProtocolDebtCeiling(debtCeiling);
        });

        it("Should break when not live", async function () {

            await lmcv.setLoanAlive(0);

            await expect(
                userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address)
            ).to.be.revertedWith("LMCV/Loan paused");
        });

        it("Should always have archadmin", async function () {
            await lmcv.setArchAdmin(addr1.address);

            await expect(lmcv.setArchAdmin(addr1.address)).to.be.revertedWith("LMCVProxy/Must be ArchAdmin")
            expect(await lmcv.ArchAdmin()).to.equal(addr1.address);
        });

        it("Should behave correctly when given collateral", async function () {
            //Total value of collateral: $6000
            //Total loanable amount: $3000
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockTokenBytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 2)).to.equal(mockToken3Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 4)).to.be.reverted;

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("505"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            let collateralType = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralType['lockedAmount']).to.equal(fwad("50"));
            let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
            expect(collateralType2['lockedAmount']).to.equal(fwad("100"));
            let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
            expect(collateralType3['lockedAmount']).to.equal(fwad("200"));

            expect(await lmcv.totalD2O()).to.equal(frad("2000"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("2000"));
        });

        it("Should behave correctly when given collateral a second time", async function () {
            //Second loan with more collateral and more d2O
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

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("3000"));

            let collateralType = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralType['lockedAmount']).to.equal(fwad("150"));
            let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
            expect(collateralType2['lockedAmount']).to.equal(fwad("200"));
            let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
            expect(collateralType3['lockedAmount']).to.equal(fwad("300"));

            expect(await lmcv.totalD2O()).to.equal(frad("3000"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("3000"));
        });

        it("Should behave correctly for second account", async function () {

            //Second loan with more collateral and more d2O
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

            expect(await userTwoLMCV.normalizedDebt(addr2.address)).to.equal(fwad("1475"));

            let collateralType = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralType['lockedAmount']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
            expect(collateralType2['lockedAmount']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
            expect(collateralType3['lockedAmount']).to.equal(fwad("411"));

            expect(await lmcv.totalD2O()).to.equal(frad("4475"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("4475"));
        });

        it("Should behave correctly when given no collateral and more d2O taken out", async function () {
            //Second loan with more d2O
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

            expect(await userTwoLMCV.normalizedDebt(addr2.address)).to.equal(fwad("2475"));

            let collateralType = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralType['lockedAmount']).to.equal(fwad("238"));
            let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
            expect(collateralType2['lockedAmount']).to.equal(fwad("299"));
            let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
            expect(collateralType3['lockedAmount']).to.equal(fwad("411"));

            expect(await lmcv.totalD2O()).to.equal(frad("5475"));
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("5475"));
        });

        it("Should break when more collateral taken out than allowed from multiple transactions", async function () {
            //Third loan with more d2O
            //Total value of collateral: $6610
            //Total loanable amount: $3305
            //Already taken out: $2475
            await expect(userTwoLMCV.loan(collateralBytesList, [fwad("0"), fwad("0"), fwad("0")], fwad("1000"), addr2.address)).to.be.reverted;
        });

        // TODO: Case where dust level has changed in between modification of d2O
        it("When dust level is set to be above loan's collateral amount for specific token, refuses new loan when token included", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.editDustLevel(mockToken2Bytes, fwad("120"));
            await expect(userTwoLMCV.loan(collateralBytesList, [fwad("10"), fwad("10"), fwad("10")], fwad("100"), addr2.address)).to.be.revertedWith("LMCV/Locked collateral amount must be higher than dust level");
        });

        it("When dust level is set to be above loan's collateral amount for specific token, allows higher loan when that token is not included", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.editDustLevel(mockToken2Bytes, fwad("120"));
            await userLMCV.loan([mockTokenBytes, mockToken3Bytes], [fwad("0"), fwad("0")], fwad("100"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("140"));
        });

        it("When dust level is set to be above loan's collateral amount for specific token, puts CDP in unhealthy state and denies more d2O loan", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1950"), addr1.address);
            await lmcv.editDustLevel(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.loan([mockTokenBytes, mockToken3Bytes], [fwad("0"), fwad("0")], fwad("100"), addr1.address)).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });
    });

    describe("Loan tests no collateral", function () {
        it("Should break if minting more d2O than allowed from collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await expect(
                userLMCV.loan([],[], fwad("100000"), addr1.address)
            ).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });

        it("Should break if minting more d2O than protocol debt ceiling", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await lmcv.setProtocolDebtCeiling(frad("50")); // [rad] $50
            await expect(
                userLMCV.loan([],[], fwad("51"), addr1.address)
            ).to.be.revertedWith("LMCV/Cannot extend past protocol debt ceiling");
            await lmcv.setProtocolDebtCeiling(debtCeiling);
        });

        it("Should work if everything filled in properly and below maxD2O", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("40"), addr1.address);
            await userLMCV.loan([],[], fwad("1000"), addr1.address)
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("1040"));
        });

        it("When dust level is set to be above loan amount, this leads to no extra d2O being loanable", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            await lmcv.editDustLevel(mockToken2Bytes, fwad("120"));
            await expect(userLMCV.loan([],[], fwad("1"), addr1.address)).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });
    });

    describe("Repay() testing", function () {
        it("Should succeed when given a collateral and an appropriate amount of d2O back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            //repay one collateral
            await userLMCV.repay([mockTokenBytes], [fwad("50")], fwad("500"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockToken3Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 2)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("277"));

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("555"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));
        });

        it("Should succeed when given all collateral and all d2O back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            //repay full collateral amount
            await userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 0)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(0);
        });

        it("Should succeed in repaying most of the collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1000"), addr1.address);

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("1000"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("1000"));

            await lmcv.administrate(d2OJoin.address, 1);
            await d2O.rely(d2OJoin.address);

            let userD2OJoin = d2OJoin.connect(addr1);
            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("50"));

            await userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("900"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("100"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("50"));
        });

        it("Should be able to repay with all d2O user has after protocol fee", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await lmcv.administrate(d2OJoin.address, 1);
            await d2O.rely(d2OJoin.address);

            let userD2OJoin = d2OJoin.connect(addr1);
            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("777"));
            await userD2OJoin.join(addr1.address, fwad("769"));

            // //repay a collateral amount
            await userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("769"), addr1.address);

            await expect(userLMCV.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(0);

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("8"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("0"));
        });

        it("Should succeed when given a collateral and an appropriate amount of d2O back", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            //repay one collateral
            await userLMCV.repay([mockTokenBytes, mockTokenBytes], [fwad("25"),fwad("25")], fwad("500"), addr1.address);

            expect(await userLMCV.lockedCollateralList(addr1.address, 0)).to.equal(mockToken3Bytes);
            expect(await userLMCV.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            await expect(userLMCV.lockedCollateralList(addr1.address, 2)).to.be.reverted;

            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(0);
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("100"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("200"));

            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("277"));

            expect(await userLMCV.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("555"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("566"));
            expect(await userLMCV.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("577"));
        });


        it("Should fail when not repaying amount of d2O needed to unlock collateral", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("1000"), addr1.address);

            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1000"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("1000"));

            await expect(
                userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });

        it("Should fail when collateral list isn't the same size as change list", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/Missing collateral type or collateral amount");
        });

        it("Should fail when owner doesn't consent", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);
            await expect(
                userTwoLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("0"), addr1.address)
            ).to.be.revertedWith("LMCV/Owner must consent");
        });

        it("Should fail when debtD2O will be lower than withdrawn d2O", async function () {
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("777"), addr1.address);

            await lmcv.administrate(d2OJoin.address, 1);
            await d2O.rely(d2OJoin.address);

            let userD2OJoin = d2OJoin.connect(addr1);
            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("777"));
            await userD2OJoin.join(addr1.address, fwad("600"));

            expect(await lmcv.d2O(addr1.address)).to.equal(frad("600"));

            // //repay a collateral amount
            await expect(
                userLMCV.repay(collateralBytesList, [fwad("0"), fwad("100"), fwad("200")], fwad("601"), addr1.address)
            ).to.be.revertedWith("LMCV/Insufficient d2O to repay");
        });

        it("Lever tokens only - previous division by 0 in isWithinCreditLimit", async function () {

            let collateralData = await lmcv.CollateralData(mockTokenBytes);
            await lmcv.editLeverageStatus(mockTokenBytes, true);

            collateralData = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralData['leveraged']).to.be.true;

            // max loan = 50 * 40 * 0.5 = 1000
            await expect(userLMCV.loan([mockTokenBytes], [fwad("50")], fwad("1100"), addr1.address))
                .to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
        });
    });

    describe("Mint Fee testing", function () {
        it("Mint fee should behave correctly when 2 loans taken out at different stability rates", async function () {

            await lmcv.setMintFee(fray(".0025"));

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("1995"));
            expect(await lmcv.d2O(owner.address)).to.equal(frad("5"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1.1"));

            expect(await lmcv.d2O(owner.address)).to.equal(frad("205"));

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("4189.5"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("4000"));
            expect(await lmcv.d2O(owner.address)).to.equal(frad("210.5"));


            await userTwoLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr2.address);
            expect(await userTwoLMCV.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await userTwoLMCV.d2O(addr2.address)).to.equal(frad("2194.5"));

            await userTwoLMCV.moveD2O(addr2.address, addr1.address, frad("2194.5"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("6384"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1.2"));

            expect(await lmcv.d2O(owner.address)).to.equal(frad("816"));

            await userLMCV.repay(collateralBytesList, [fwad("100"), fwad("200"), fwad("400")], fwad("4000"), addr1.address);
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1584"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(0);
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("2000"));
        });
    });

    describe("seize() testing", function () {
        it("Liquidation correctly increases protocol deficit and reduces total normalized debt", async function () {
            // 50 x 40 = 2000.
            await userLMCV.loan([mockTokenBytes], [fwad("50")], fwad("500"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("500"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("500"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            // No need to make the vault unhealthy in this test as all those checks are handled by the liquidation
            // contract. LMCV.liquidate assumes the parameters it is called with have been set correctly by the 
            // liquidation contract.
            //
            // We will do a 33% liquidation for this test.
            // 33% x 500 d2O = 165 d2O
            // 165 dPRIME / 40  = 4.125 MockToken
            // So we reduce the locked dPRIME and collateral balances by 165 dPRIME - this equates to 4.125 MockToken.
            // Note, these are not necessarily correct numbers as per liquidation contract operation but they are adequate 
            // for testing the LMCV.
            await lmcv.seize([mockTokenBytes], [fwad("4.125")], fwad("165"), addr1.address, liquidator.address, liquidator.address);
            // Debit the normalized debt by the amount being liquidated and credit the liquidation debt.
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("335"));
            expect(await userLMCV.totalNormalizedDebt()).to.equal(fwad("335"));
            expect(await lmcv.protocolDeficit(liquidator.address)).to.equal(frad("165"));
            expect(await lmcv.totalProtocolDeficit()).to.equal(frad("165"));
            // Debit the users locked collateral and credit the liquidation contract unlocked collateral.
            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("45.875"));
            expect(await userLMCV.unlockedCollateral(liquidator.address, mockTokenBytes)).to.equal(fwad("4.125"));
            // dPRIME balance should remain the same.
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("500"));
            // We subsequently manage to raise the whole amount of dPRIME via auction....
            await lmcv.inflate(liquidator.address, liquidator.address, frad("165"));
            // We now have 330 of liquidation debt but only 165 of it pertains to this test.
            expect(await lmcv.protocolDeficit(liquidator.address)).to.equal(frad("330"));
            await liquidatorLMCV.deflate(frad("165"));
            // We created an additional 165 of liquidation debt when we "gave" dPRIME to the liquidation contract. So we should have 
            // 165 after calling repayLiquidationDebt. 
            expect(await lmcv.protocolDeficit(liquidator.address)).to.equal(frad("165"));
            // Repay liquidation debt burns the dPRIME we received via the auction.
            expect(await liquidatorLMCV.d2O(liquidator.address)).to.equal(frad("0"));
        });

        it("Confiscate all collateral", async function () {
            // 50 x 40 = 2000.
            await userLMCV.loan([mockTokenBytes], [fwad("50")], fwad("1000"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("1000"));
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("1000"));
            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("50"));
            
            await lmcv.seize([mockTokenBytes], [fwad("50")], fwad("1000"), addr1.address, liquidator.address, liquidator.address);
            // Debit the normalized debt by the amount being liquidated and credit the liquidation debt.
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("0"));
            expect(await userLMCV.totalNormalizedDebt()).to.equal(fwad("0"));
            expect(await lmcv.protocolDeficit(liquidator.address)).to.equal(frad("1000"));
            expect(await lmcv.totalProtocolDeficit()).to.equal(frad("1000"));
            // Debit the users locked collateral and credit the liquidation contract unlocked collateral.
            expect(await userLMCV.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await userLMCV.unlockedCollateral(liquidator.address, mockTokenBytes)).to.equal(fwad("50"));
            // dPRIME balance should remain the same.
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("1000"));
            // User should have no MockToken anymore.
            await expect(userLMCV.lockedCollateralList(addr1.address, 0)).to.be.reverted;
        });
    });

    describe("Weighted average LTV testing", function () {
        it("Weighted average LTV calculated correctly", async function () {
            // Set different credit ratios.
            await lmcv.editCreditRatio(mockToken2Bytes, fray("0.8"));
            await lmcv.editCreditRatio(mockToken3Bytes, fray("0.7"));
            let collateralType1 = await lmcv.CollateralData(mockTokenBytes);
            expect(collateralType1['creditRatio']).to.equal(fray("0.5"));
            let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
            expect(collateralType2['creditRatio']).to.equal(fray("0.8"));
            let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
            expect(collateralType3['creditRatio']).to.equal(fray("0.7"));
            // Try to get a loan for 2150.1 dPRIME when the credit limit is 2150.
            // 50 x 40 x 0.5 = 1,000
            // 50 * 20 x 0.8 = 800
            // 50 x 10 x 0.7 = 350
            //               = 2,150
            await expect(userLMCV.loan(collateralBytesList, [fwad("50"), fwad("50"), fwad("50")], fwad("2150.1"), addr1.address)).to.be.revertedWith("LMCV/Exceeded portfolio credit limit");
            // A loan for 2,150 works, which is to be expected basec upon the credit limit logic.
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("50"), fwad("50")], fwad("2150"), addr1.address);
            expect(await userLMCV.d2O(addr1.address)).to.equal(frad("2150"));
        });
    });
});


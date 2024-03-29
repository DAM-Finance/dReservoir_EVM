
const {expect} = require("chai");
const {ethers} = require("hardhat");


let owner, addr1, addr2, addr3, addrs;
let d2oFactory, d2o;
let d2oJoinFactory, d2oJoin;
let LMCVFactory, lmcv;
let tokenFactory, mockToken, mockTokenTwo, mockTokenThree;
let collateralJoinFactory, collateralJoin;
let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let mockToken2Bytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let mockToken3Bytes = ethers.utils.formatBytes32String("MOCKTOKENTHREE");
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

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = mockTokenTwo.connect(addr);
    let mockToken3Connect = mockTokenThree.connect(addr);

    await mockTokenConnect.approve(lmcvProxy.address, MAX_INT);
    await mockToken2Connect.approve(lmcvProxy.address, MAX_INT);
    await mockToken3Connect.approve(lmcvProxy.address, MAX_INT); 

    await mockTokenConnect.mint(addr.address, fwad(amounts.at(0)));
    await mockToken2Connect.mint(addr.address, fwad(amounts.at(1)));
    await mockToken3Connect.mint(addr.address, fwad(amounts.at(2)));
}

describe("Testing LMCVProxy", function () {

    before(async function () {
        d2oFactory = await ethers.getContractFactory("d2o");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        d2oJoinFactory = await ethers.getContractFactory("d2oJoin");
        tokenFactory = await ethers.getContractFactory("TestERC20");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

       
        d2o = await d2oFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        d2oJoin = await d2oJoinFactory.deploy(lmcv.address, d2o.address, lmcvProxy.address);

        mockToken = await tokenFactory.deploy("Tester", "TSTR");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockTokenBytes, mockToken.address);

        mockTokenTwo = await tokenFactory.deploy("Tester2", "TST2");
        mockTokenThree = await tokenFactory.deploy("Tester3", "TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockToken2Bytes, mockTokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockToken3Bytes, mockTokenThree.address);


        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);
        await lmcv.administrate(d2oJoin.address, 1);
        await d2o.rely(d2oJoin.address);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);
        await lmcv.setMintFee(fray(".01"));

        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), false);

        await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
        await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

        await lmcvProxy.setD2oJoin(d2oJoin.address);
        await lmcvProxy.setD2o(d2o.address);

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);

        await lmcvProxy.editCollateral(mockTokenBytes, collateralJoin.address, mockToken.address, MAX_INT);
        await lmcvProxy.editCollateral(mockToken2Bytes, collatJoinTwo.address, mockTokenTwo.address, MAX_INT);
        await lmcvProxy.editCollateral(mockToken3Bytes, collatJoinThree.address, mockTokenThree.address, MAX_INT);
    });

    describe("createLoan function testing", function () {

        beforeEach(async function () {
            userLMCVProxy = lmcvProxy.connect(addr1);
        });

        it("Should properly add collateral, loan, and exit with d2o", async function () {
            //Below calls are what website would have to do
            await setupUser(addr1, ["1000", "1000", "1000"]);
            await userLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);

            await userLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));

            expect(await lmcv.d2o(owner.address)).to.equal(frad("10"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await mockToken.balanceOf(collateralJoin.address)).to.equal(fwad("100"));
            expect(await mockTokenTwo.balanceOf(collatJoinTwo.address)).to.equal(fwad("200"));
            expect(await mockTokenThree.balanceOf(collatJoinThree.address)).to.equal(fwad("300"));

            expect(await lmcv.lockedCollateralList(addr1.address, 0)).to.equal(mockTokenBytes);
            expect(await lmcv.lockedCollateralList(addr1.address, 1)).to.equal(mockToken2Bytes);
            expect(await lmcv.lockedCollateralList(addr1.address, 2)).to.equal(mockToken3Bytes);
            await expect(lmcv.lockedCollateralList(addr1.address, 4)).to.be.reverted;

            expect(await lmcv.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await lmcv.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
            expect(await lmcv.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));
            
            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("100"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("200"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("300"));
        });

        it("Should break when account doesn't have enough collateral", async function () {
            //Below calls are what website would have to do
            await setupUser(addr1, ["10", "1000", "1000"]);
            await userLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);

            await expect(
                userLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Should break when not live", async function () {
            await setupUser(addr1, ["10", "1000", "1000"]);
            await userLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);

            await lmcvProxy.setLive(0);

            await expect(
                userLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"))
            ).to.be.revertedWith("LMCVProxy/not-live");
        });

        it("Should always have archadmin", async function () {
            await lmcvProxy.setArchAdmin(addr1.address);

            await expect(lmcvProxy.setArchAdmin(addr1.address)).to.be.revertedWith("LMCVProxy/Must be ArchAdmin")
            expect(await lmcvProxy.ArchAdmin()).to.equal(addr1.address);
        });
    });

    describe("repayLoan function testing", function () {

        let userD2o;
        let userTwoLMCV, userTwoLMCVProxy, userTwoD2o;

        beforeEach(async function () {
            userLMCVProxy = lmcvProxy.connect(addr1);
            userD2o = d2o.connect(addr1);

            userTwoLMCV = lmcv.connect(addr2);
            userTwoLMCVProxy = lmcvProxy.connect(addr2);
            userTwoD2o = d2o.connect(addr2);
        });

        it("Should properly add collateral, loan, and exit with d2o", async function () {
            await setupUser(addr1, ["1000", "1000", "1000"]);
            await userLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);
            await userLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));

            await setupUser(addr2, ["1000", "1000", "1000"]);
            await userTwoLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);
            await userTwoLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));
            await userTwoD2o.transfer(addr1.address, fwad("990"));

            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1980"));

            // Has to approve d2o
            await userD2o.approve(lmcvProxy.address, MAX_INT);
            await userLMCVProxy.repayLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));

            await expect(userTwoLMCV.lockedCollateralList(addr1.address, 0)).to.be.reverted;

            expect(await lmcv.d2o(addr1.address)).to.equal("0");
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal("0");

            expect( await mockToken.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenTwo.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenThree.balanceOf(addr1.address)).to.equal(fwad("1000"));
        });

        it("Should be able to not repay one coin and still finish loan", async function () {
            await setupUser(addr1, ["1000", "1000", "1000"]);
            await userLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);
            await userLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));

            await setupUser(addr2, ["1000", "1000", "1000"]);
            await userTwoLMCV.approveMultiple([lmcvProxy.address, d2oJoin.address]);
            await userTwoLMCVProxy.createLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));
            await userTwoD2o.transfer(addr1.address, fwad("990"));

            // Has to approve d2o
            await userD2o.approve(lmcvProxy.address, MAX_INT);
            await userLMCVProxy.repayLoan([mockTokenBytes, mockToken2Bytes], [fwad("100"), fwad("200")], fwad("800"));

            expect(await lmcv.d2o(owner.address)).to.equal(frad("20"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1180"));
            expect(await mockToken.balanceOf(collateralJoin.address)).to.equal(fwad("100"));
            expect(await mockTokenTwo.balanceOf(collatJoinTwo.address)).to.equal(fwad("200"));
            expect(await mockTokenThree.balanceOf(collatJoinThree.address)).to.equal(fwad("600"));

            expect(await lmcv.lockedCollateralList(addr1.address, 0)).to.equal(mockToken3Bytes);
            await expect(lmcv.lockedCollateralList(addr1.address, 1)).to.be.reverted;

            expect(await lmcv.unlockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await lmcv.unlockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
            expect(await lmcv.unlockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));
            
            expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
            expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("300"));

            expect(await lmcv.d2o(addr1.address)).to.equal(frad("0"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("200"));

            expect( await mockToken.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenTwo.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenThree.balanceOf(addr1.address)).to.equal(fwad("700"));

            await userLMCVProxy.repayLoan([mockToken3Bytes], [fwad("300")], fwad("200"));

            await expect(userTwoLMCV.lockedCollateralList(addr1.address, 0)).to.be.reverted;

            expect(await lmcv.d2o(addr1.address)).to.equal("0");
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal("0");

            expect( await mockToken.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenTwo.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect( await mockTokenThree.balanceOf(addr1.address)).to.equal(fwad("1000"));
        });
    });
});
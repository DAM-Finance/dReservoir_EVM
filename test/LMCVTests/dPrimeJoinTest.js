const { expect } = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}

let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let d2OFactory, d2O;
let d2OJoinFactory, d2OJoin;
let tokenFactory, mockToken;
let LMCVFactory, lmcv;
let owner, addr1, addr2, addrs;
let userD2O, userD2OJoin;
let userLMCV;
let lmcvProxy, lmcvProxyFactory;
let userTwoLMCV, userTwoD2OJoin;

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


async function setupUser(addr, amount){
    let mockTokenConnect = mockToken.connect(addr);
    await mockTokenConnect.approve(collateralJoin.address, MAX_INT);
    await mockTokenConnect.mint(fwad("1000"));

    let collatJoinConnect = collateralJoin.connect(addr);
    await collatJoinConnect.join(addr.address, fwad(amount));

    userD2O = d2O.connect(addr);
    await userD2O.approve(d2OJoin.address, fwad("10000"));
}

async function mineNBlocks(n) {
    for (let index = 0; index < n; index++) {
      await ethers.provider.send('evm_mine');
    }
  }

describe("d2O Testing", function () {

    before(async function () {
        d2OFactory              = await ethers.getContractFactory("d2O");
        LMCVFactory             = await ethers.getContractFactory("LMCV");
        d2OJoinFactory          = await ethers.getContractFactory("d2OJoin");
        tokenFactory            = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
        liquidatorFactory       = await ethers.getContractFactory("Liquidator");
        auctionHouseFactory     = await ethers.getContractFactory("AuctionHouse");
        lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        d2O = await d2OFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        d2OJoin = await d2OJoinFactory.deploy(lmcv.address, d2O.address, lmcvProxy.address);
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        mockToken = await tokenFactory.deploy("TSTR");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockTokenBytes, mockToken.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(d2OJoin.address, 1);
        await lmcv.editAcceptedCollateralType(
            mockTokenBytes,     // Collateral name.
            fwad("10000"),      // Amount limit.
            fwad("1"),          // Dust level.
            fray("0.5"),        // Credit limit. I.e. an LTV of 50%.
            false
        );

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await lmcv.updateSpotPrice(mockTokenBytes, fray("10"));

        await d2O.rely(d2OJoin.address);

        await setupUser(addr1, "1000");
        await setupUser(addr2, "1000");
        await lmcv.setMintFee(fray(".01"));

        userLMCV = lmcv.connect(addr1);
        userD2OJoin = d2OJoin.connect(addr1);

        userTwoLMCV = lmcv.connect(addr2);
        userTwoD2OJoin = d2OJoin.connect(addr2);
    });

    describe("d2OJoin Testing", function () {

        it("Should let user withdraw d2O after loan has been called correctly", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("100"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1880"));
            expect(await d2O.balanceOf(addr1.address)).to.equal(fwad("100"));
            expect(await lmcv.d2O(owner.address)).to.equal(frad("20"));
        });

        it("Should not let user withdraw d2O greater than specified in normalizedDebt * AccumulatedRate", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("100"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1880"));

            await expect(userD2OJoin.exit(addr1.address, fwad("1901"))).to.be.revertedWith("LMCV/Insufficient d2O to move");
        });

        it("User cannot deposit d2O with insufficient balance", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("1000"));

            await userTwoLMCV.approveMultiple([userD2OJoin.address]);
            await userTwoD2OJoin.exit(addr2.address, fwad("1000"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("980"));

            // Fails because a fee was taken upon calling `userD2OJoin.exit`.
            await expect(userD2OJoin.join(addr1.address, fwad("1001"))).to.be.revertedWith("d2O/insufficient-balance");
        });

        it("User can re-deposit a portion of their withdrawn d2O", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userD2OJoin.exit(addr1.address, fwad("1000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("980"));

            await userD2OJoin.join(addr1.address, fwad("500"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1480"));
        });

        it("User receives d2O externally and re-deposits", async function () {
            await userLMCV.approveMultiple([userD2OJoin.address]);
            await userTwoLMCV.approveMultiple([userTwoD2OJoin.address]);

            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("1980"));

            await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
            expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr2.address)).to.equal(frad("1980"));

            await userD2OJoin.exit(addr1.address, fwad("1000"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("980"));

            await userTwoD2OJoin.exit(addr2.address, fwad("1000"));
            expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2O(addr2.address)).to.equal(frad("980"));

            //transfer to user1 then user 1 repays fully
            userTwoD2O = d2O.connect(addr2);

            await userTwoD2O.transfer(addr1.address, fwad("500"));
            expect(await d2O.balanceOf(addr1.address)).to.equal(fwad("1500"));
            expect(await d2O.balanceOf(addr2.address)).to.equal(fwad("500"));

            await userD2OJoin.join(addr1.address, fwad("1500"));
            expect(await lmcv.d2O(addr1.address)).to.equal(frad("2480"));
        });
    });

    describe("d2O Mint Testing", function () {
        const blockwait = 6;
        const lockupTriggerAmt = fwad("999");

        beforeEach(async function () {
            await d2O.setTransferBlockWait(blockwait);
            await d2O.setLockupTriggerAmount(lockupTriggerAmt);
        });

        it("Should prevent user from transferring d2O until n amount of blocks after mintAndDelay is called", async function () {
            
            userD2O = d2O.connect(addr1);
            user2D2O = d2O.connect(addr2);

            await userD2O.approve(addr2.address, MAX_INT);

            let txresult = await d2O.mintAndDelay(addr1.address, fwad("1000"));
            expect(await d2O.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await d2O.transferBlockRelease(addr1.address)).to.equal(txresult.blockNumber + blockwait);

            await expect(userD2O.transfer(addr2.address, fwad("100"))).to.be.revertedWith("d2O/transfer too soon after cross-chain mint");
            await expect(user2D2O.transferFrom(addr1.address, addr2.address, fwad("100"))).to.be.revertedWith("d2O/transfer too soon after cross-chain mint");

            await mineNBlocks(blockwait);

            await userD2O.transfer(addr2.address, fwad("100"));
            expect(await d2O.balanceOf(addr2.address)).to.equal(fwad("100"));

            await user2D2O.transferFrom(addr1.address, addr2.address, fwad("100"));
            expect(await d2O.balanceOf(addr2.address)).to.equal(fwad("200"));
        });

        it("Should prevent user from transferring d2O until n amount of blocks after mintAndDelay is called", async function () {
            userD2O = d2O.connect(addr1);
            user2D2O = d2O.connect(addr2);

            await userD2O.approve(addr2.address, MAX_INT);

            let txresult = await d2O.mintAndDelay(addr1.address, fwad("500"));
            expect(await d2O.balanceOf(addr1.address)).to.equal(fwad("500"));
            expect(await d2O.transferBlockRelease(addr1.address)).to.equal(0);

            await userD2O.transfer(addr2.address, fwad("100"));
            expect(await d2O.balanceOf(addr2.address)).to.equal(fwad("100"));

            await user2D2O.transferFrom(addr1.address, addr2.address, fwad("100"));
            expect(await d2O.balanceOf(addr2.address)).to.equal(fwad("200"));
        });
    });
});

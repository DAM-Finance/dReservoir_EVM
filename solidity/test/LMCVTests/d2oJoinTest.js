const { expect } = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}

let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let d2oFactory, d2o;
let d2oJoinFactory, d2oJoin;
let tokenFactory, mockToken;
let LMCVFactory, lmcv;
let owner, addr1, addr2, addrs;
let userD2o, userD2oJoin;
let userLMCV;
let lmcvProxy, lmcvProxyFactory;
let userTwoLMCV, userTwoD2oJoin;
let d2oGuardian, d2oGuardianFactory;

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


async function setupUser(addr, amount){
    let mockTokenConnect = mockToken.connect(addr);
    await mockTokenConnect.approve(collateralJoin.address, MAX_INT);
    await mockTokenConnect.mint(fwad("1000"));

    let collatJoinConnect = collateralJoin.connect(addr);
    await collatJoinConnect.join(addr.address, fwad(amount));

    userD2o = d2o.connect(addr);
    await userD2o.approve(d2oJoin.address, fwad("10000"));
}

async function mineNBlocks(n) {
    for (let index = 0; index < n; index++) {
      await ethers.provider.send('evm_mine');
    }
  }

describe("d2o Testing", function () {

    before(async function () {
        d2oFactory              = await ethers.getContractFactory("d2o");
        LMCVFactory             = await ethers.getContractFactory("LMCV");
        d2oJoinFactory          = await ethers.getContractFactory("d2oJoin");
        tokenFactory            = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
        liquidatorFactory       = await ethers.getContractFactory("Liquidator");
        auctionHouseFactory     = await ethers.getContractFactory("AuctionHouse");
        lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");
        d2oGuardianFactory      = await ethers.getContractFactory("d2oGuardian");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        d2o = await d2oFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        d2oJoin = await d2oJoinFactory.deploy(lmcv.address, d2o.address, lmcvProxy.address);
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        mockToken = await tokenFactory.deploy("TSTR");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockTokenBytes, mockToken.address);
        d2oGuardian = await d2oGuardianFactory.deploy(d2o.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(d2oJoin.address, 1);
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

        await d2o.rely(d2oJoin.address);
        await d2o.rely(d2oGuardian.address);
        

        await setupUser(addr1, "1000");
        await setupUser(addr2, "1000");
        await lmcv.setMintFee(fray(".01"));

        userLMCV = lmcv.connect(addr1);
        userD2oJoin = d2oJoin.connect(addr1);

        userTwoLMCV = lmcv.connect(addr2);
        userTwoD2oJoin = d2oJoin.connect(addr2);
    });

    describe("d2oJoin Testing", function () {

        it("Should let user withdraw d2o after loan has been called correctly", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2oJoin.address]);
            await userD2oJoin.exit(addr1.address, fwad("100"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("1880"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("100"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("20"));
        });

        it("Should not let user withdraw d2o greater than specified in normalizedDebt * AccumulatedRate", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2oJoin.address]);
            await userD2oJoin.exit(addr1.address, fwad("100"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("1880"));

            await expect(userD2oJoin.exit(addr1.address, fwad("1901"))).to.be.revertedWith("LMCV/Insufficient d2o to move");
        });

        it("User cannot deposit d2o with insufficient balance", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2oJoin.address]);
            await userD2oJoin.exit(addr1.address, fwad("1000"));

            await userTwoLMCV.approveMultiple([userD2oJoin.address]);
            await userTwoD2oJoin.exit(addr2.address, fwad("1000"));

            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("980"));

            // Fails because a fee was taken upon calling `userD2oJoin.exit`.
            await expect(userD2oJoin.join(addr1.address, fwad("1001"))).to.be.revertedWith("d2o/insufficient-balance");
        });

        it("User can re-deposit a portion of their withdrawn d2o", async function () {
            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

            await userLMCV.approveMultiple([userD2oJoin.address]);
            await userD2oJoin.exit(addr1.address, fwad("1000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("980"));

            await userD2oJoin.join(addr1.address, fwad("500"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("1480"));
        });

        it("User receives d2o externally and re-deposits", async function () {
            await userLMCV.approveMultiple([userD2oJoin.address]);
            await userTwoLMCV.approveMultiple([userTwoD2oJoin.address]);

            await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("1980"));

            await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
            expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr2.address)).to.equal(frad("1980"));

            await userD2oJoin.exit(addr1.address, fwad("1000"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("980"));

            await userTwoD2oJoin.exit(addr2.address, fwad("1000"));
            expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await lmcv.d2o(addr2.address)).to.equal(frad("980"));

            //transfer to user1 then user 1 repays fully
            userTwoD2o = d2o.connect(addr2);

            await userTwoD2o.transfer(addr1.address, fwad("500"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1500"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("500"));

            await userD2oJoin.join(addr1.address, fwad("1500"));
            expect(await lmcv.d2o(addr1.address)).to.equal(frad("2480"));
        });
    });

    describe("d2o Mint Testing", function () {
        const blockwait = 6;
        const lockupTriggerAmt = fwad("999");

        beforeEach(async function () {
            await d2o.setTransferBlockWait(blockwait);
            await d2o.setLockupTriggerAmount(lockupTriggerAmt);
        });

        it("Should prevent user from transferring d2o until n amount of blocks after mintAndDelay is called", async function () {
            
            userD2o = d2o.connect(addr1);
            user2D2o = d2o.connect(addr2);

            await userD2o.approve(addr2.address, MAX_INT);

            let txresult = await d2o.mintAndDelay(addr1.address, fwad("1000"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(txresult.blockNumber + blockwait);

            await expect(userD2o.transfer(addr2.address, fwad("100"))).to.be.revertedWith("d2o/transfer too soon after cross-chain mint");
            await expect(user2D2o.transferFrom(addr1.address, addr2.address, fwad("100"))).to.be.revertedWith("d2o/transfer too soon after cross-chain mint");

            await mineNBlocks(blockwait);

            await userD2o.transfer(addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("100"));

            await user2D2o.transferFrom(addr1.address, addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("200"));
        });

        it("Should prevent user from burning d2o until n amount of blocks after mintAndDelay is called", async function () {
            userD2o = d2o.connect(addr1);

            let txresult = await d2o.mintAndDelay(addr1.address, fwad("1000"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(txresult.blockNumber + blockwait);

            await expect(userD2o.burn(addr1.address, fwad("100"))).to.be.revertedWith("d2o/burn too soon after cross-chain mint");

            await mineNBlocks(blockwait);

            await userD2o.burn(addr1.address, fwad("100"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("900"));
        });

        it("Should work when using low amount", async function () {
            userD2o = d2o.connect(addr1);
            user2D2o = d2o.connect(addr2);

            await userD2o.approve(addr2.address, MAX_INT);

            let txresult = await d2o.mintAndDelay(addr1.address, fwad("500"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("500"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(0);

            await userD2o.transfer(addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("100"));

            await user2D2o.transferFrom(addr1.address, addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("200"));
        });

        
        it("d2o Guardian should prevent user from being able to transfer and admin can reset", async function () {
            userD2o = d2o.connect(addr1);
            let user2D2o = d2o.connect(addr2);

            await userD2o.approve(addr2.address, MAX_INT);

            await d2o.mintAndDelay(addr1.address, fwad("500"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("500"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(0);

            //Guardian blocks
            await d2oGuardian.cageUser(addr1.address);

            await expect(userD2o.transfer(addr2.address, fwad("100"))).to.be.revertedWith("d2o/transfer too soon after cross-chain mint");
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(MAX_INT);
            

            //Admin resets in case of incorrect false mint
            await d2o.setTransferBlockRelease(addr1.address, 0);


            //Transfers working again
            await userD2o.transfer(addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("100"));

            await user2D2o.transferFrom(addr1.address, addr2.address, fwad("100"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("200"));
        });


        it("Should allow admin to burn but not user with mintAndDelay or CageUser", async function () {
            userD2o = d2o.connect(addr1);

            let txresult = await d2o.mintAndDelay(addr1.address, fwad("1000"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(txresult.blockNumber + blockwait);

            await expect(userD2o.burn(addr1.address, fwad("100"))).to.be.revertedWith("d2o/burn too soon after cross-chain mint");
            expect(await d2o.burn(addr1.address, fwad("9")));
            
            //Mine blocks for blockDelay
            await mineNBlocks(blockwait);

            await userD2o.burn(addr1.address, fwad("100"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("891"));

            //Cage user entirely for suspicious behavior
            await d2oGuardian.cageUser(addr1.address);

            await expect(userD2o.burn(addr1.address, fwad("100"))).to.be.revertedWith("d2o/burn too soon after cross-chain mint");
            expect(await d2o.burn(addr1.address, fwad("11")));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("880"));
            expect(await d2o.transferBlockRelease(addr1.address)).to.equal(MAX_INT);

            //Admins unlock user account
            await d2o.setTransferBlockRelease(addr1.address, 0);

            await userD2o.burn(addr1.address, fwad("100"));
            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("780"));

        });
    });
});

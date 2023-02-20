const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let d2oFactory, d2o;
let d2oJoinFactory, d2oJoin;
let LMCVFactory, lmcv;
let tokenFactory, USDCMock;
let collateralJoinFactory, collateralJoin;
let USDCMockBytes = ethers.utils.formatBytes32String("USDC");
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;
let lmcvProxy, lmcvProxyFactory;
let psm, psmFactory;
let userPSM;
let userD2o;

let regularTokenFactory, regularCollateralJoinFactory;
let mockToken2Bytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let tokenTwo;
let collatJoinTwo;

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}
//Parse from wad,ray,rad
function pwad(bigNumber){ return bigNumber.div("1000000000000000000")}
function pray(bigNumber){ return bigNumber.div("1000000000000000000000000000")} 
function prad(bigNumber){ return bigNumber.div("1000000000000000000000000000000000000000000000")}

async function setupUser(addr, amounts){
    let mockTokenConnect = USDCMock.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address);
    await mockToken2Connect.approve(collatJoinTwo.address, MAX_INT);

    await mockTokenConnect.mint(fwad(amounts.at(0)));
    await mockToken2Connect.mint(fwad(amounts.at(0)));
}

describe("Testing PSM", function () {

    before(async function () {
        d2oFactory = await ethers.getContractFactory("d2o");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        d2oJoinFactory = await ethers.getContractFactory("d2oJoin");
        tokenFactory = await ethers.getContractFactory("MockTokenThree");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoinDecimals");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        psmFactory = await ethers.getContractFactory("PSM");

        regularTokenFactory = await ethers.getContractFactory("MockTokenFour");
        regularCollateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        d2o = await d2oFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        d2oJoin = await d2oJoinFactory.deploy(lmcv.address, d2o.address, lmcvProxy.address);

        //TOken setup
        USDCMock = await tokenFactory.deploy("TSTR", 10);
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, USDCMockBytes, USDCMock.address);
        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.editAcceptedCollateralType(USDCMockBytes, fwad("100000000000000000000000000000"), fwad("1"), fray("1"), false);
        await lmcv.updateSpotPrice(USDCMockBytes, fray("1"));

        //TOken setup
        tokenTwo = await regularTokenFactory.deploy("TST2");
        collatJoinTwo = await regularCollateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockToken2Bytes, tokenTwo.address);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("10000"), fwad("1"), fray(".5"), false);
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("1"));

        await setupUser(addr1, ["4000", "4000", "2000"]);

        debtCeiling = frad("5000000000000000000000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await d2o.rely(d2oJoin.address);

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);

        psm = await psmFactory.deploy(collateralJoin.address, d2oJoin.address, owner.address);
        userPSM = psm.connect(addr1);
        userD2o = d2o.connect(addr1);
    });

    describe("PSM testing", function () {
        it("Should properly add collateral, loan, and exit with d2o", async function () {
            await lmcv.setPSMAddress(psm.address, true);

            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);
            let total = 0;

            for (let i = 0; i < 50; i++) {
                // console.log(i);
                let amount = Math.random();
                let amountMult = Math.round(amount*4000000000000);
                total = total + amountMult;

                await userPSM.createD2o(addr1.address, [USDCMockBytes],[amountMult]); 
                if(i%10 == 0){
                    let proper = fwad("" + (total / 10000000000));
                    let result = await lmcv.lockedCollateral(psm.address, USDCMockBytes);
                    expect(result).to.equal(proper);
                }
              }
        });

        it("Should properly add collateral, loan, and exit with d2o", async function () {

            //Set PSM in LMCV for no fee or interest
            await lmcv.setPSMAddress(psm.address, true);

            //Approve PSM from user perspective to transfer out
            await userD2o.approve(psm.address, fray("100000"));

            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);

            //Auth needed on collatJoin so regular users can't deposit as PSM does
            await collateralJoin.rely(psm.address);

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createD2o(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await d2o.balanceOf(addr1.address)).to.equal(0);
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Should work properly with fee", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userD2o.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createD2o(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("20"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2d2o = d2o.connect(addr2);
            await user2d2o.transfer(addr1.address, fwad("20"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await d2o.balanceOf(addr1.address)).to.equal(0);
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("30"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Loan and repay work properly with rate increase but no other accounts", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userD2o.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createD2o(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("20"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2d2o = d2o.connect(addr2);
            await user2d2o.transfer(addr1.address, fwad("20"));

            await lmcv.updateRate(fray(".1"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await d2o.balanceOf(addr1.address)).to.equal(0);
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("30"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Loan and repay work properly with rate increase with normal accounts", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userD2o.approve(psm.address, fray("100000"));
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createD2o(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await d2o.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.d2o(owner.address)).to.equal(frad("20"));


            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2d2o = d2o.connect(addr2);
            await user2d2o.transfer(addr1.address, fwad("20"));

            let collatJoin2Connect = collatJoinTwo.connect(addr1);
            await collatJoin2Connect.join(addr1.address, fwad("1000"));
            await userLMCV.loan([mockToken2Bytes], [fwad("1000")], fwad("500"), addr1.address);

            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));
            expect(await lmcv.totalD2o()).to.equal(frad("2500"));


            await lmcv.updateRate(fray(".1"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await d2o.balanceOf(addr1.address)).to.equal(0);
            expect(await d2o.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000");
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));

            expect(await lmcv.d2o(owner.address)).to.equal(frad("80"))
            expect(await lmcv.totalD2o()).to.equal(frad("1550"));
        });
    });

    describe("ArchAdmin and Cage testing", function () {

        it("Should break when not live", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userD2o.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setLive(0);

            await expect(
                userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"])
            ).to.be.revertedWith("PSM/not-live");
        });

        it("Should always have archadmin", async function () {
            await expect(psm.deny(owner.address)).to.be.revertedWith("PSM/ArchAdmin cannot lose admin - update ArchAdmin to another address")

            await psm.setArchAdmin(addr1.address);

            await expect(psm.setArchAdmin(addr1.address)).to.be.revertedWith("PSM/Must be ArchAdmin")
            expect(await psm.ArchAdmin()).to.equal(addr1.address);

            
        });

        it("CollateralJoinDecimals should break when not live", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userD2o.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await collateralJoin.cage(0);

            await expect(
                userPSM.createD2o(addr1.address, [USDCMockBytes],["10000000000000"])
            ).to.be.revertedWith("CollateralJoin/not-live");
        });

        it("CollateralJoinDecimals should always have archadmin", async function () {
            await expect(collateralJoin.deny(owner.address)).to.be.revertedWith("CollateralJoinDec/ArchAdmin cannot lose admin - update ArchAdmin to another address")
            await collateralJoin.setArchAdmin(addr1.address);

            await expect(collateralJoin.setArchAdmin(addr1.address)).to.be.revertedWith("CollateralJoinDec/Must be ArchAdmin")
            expect(await collateralJoin.ArchAdmin()).to.equal(addr1.address);
        });

        it("CollateralJoin should break when not live", async function () {
            let collatJoin2Connect = collatJoinTwo.connect(addr1);
            await collatJoinTwo.cage(0);

            await expect(
                collatJoin2Connect.join(addr1.address, fwad("1000"))
            ).to.be.revertedWith("CollateralJoin/not-live");
        });

        it("CollateralJoin should always have archadmin", async function () {
            await expect(collatJoinTwo.deny(owner.address)).to.be.revertedWith("CollateralJoin/ArchAdmin cannot lose admin - update ArchAdmin to another address")
            await collatJoinTwo.setArchAdmin(addr1.address);

            await expect(collatJoinTwo.setArchAdmin(addr1.address)).to.be.revertedWith("CollateralJoin/Must be ArchAdmin")
            expect(await collatJoinTwo.ArchAdmin()).to.equal(addr1.address);
        });

        it("Admin can change treasury and regular user cannot", async function () {
            await psm.setTreasury(addr3.address);
            expect(await psm.treasury()).to.be.equal(addr3.address);

            await expect(userPSM.setTreasury(addr1.address)).to.be.reverted;
        });

    });
});


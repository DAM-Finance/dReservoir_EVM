const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, USDCMock;
let collateralJoinFactory, collateralJoin;
let USDCMockBytes = ethers.utils.formatBytes32String("USDC");
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;
let lmcvProxy, lmcvProxyFactory;
let psm, psmFactory;
let userPSM;
let userDPrime;

let regularTokenFactory, regularCollateralJoinFactory;
let mockToken2Bytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let tokenTwo;
let collatJoinTwo;


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
    await mockToken2Connect.approve(collatJoinTwo.address);

    await mockTokenConnect.mint(fwad(amounts.at(0)));
    await mockToken2Connect.mint(fwad(amounts.at(0)));
}

describe("Testing LMCV", function () {

    before(async function () {
        dPrimeFactory = await ethers.getContractFactory("dPrime");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        tokenFactory = await ethers.getContractFactory("MockTokenThree");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoinDecimals");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        psmFactory = await ethers.getContractFactory("PSM");

        regularTokenFactory = await ethers.getContractFactory("MockTokenTwo");
        regularCollateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrime = await dPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        //TOken setup
        USDCMock = await tokenFactory.deploy("TSTR", 10);
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, USDCMockBytes, USDCMock.address);
        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.editAcceptedCollateralType(USDCMockBytes, fwad("10000"), fwad("1"), fray("1"), false);
        await lmcv.updateSpotPrice(USDCMockBytes, fray("1"));

        //TOken setup
        tokenTwo = await regularTokenFactory.deploy("TST2");
        collatJoinTwo = await regularCollateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken2Bytes, tokenTwo.address);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("10000"), fwad("1"), fray(".5"), false);
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("1"));

        await setupUser(addr1, ["4000", "4000", "2000"]);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await dPrime.rely(dPrimeJoin.address);

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);

        psm = await psmFactory.deploy(collateralJoin.address, dPrimeJoin.address, owner.address);
        userPSM = psm.connect(addr1);
        userDPrime = dPrime.connect(addr1);
    });

    describe("PSM testing", function () {
        it("Should properly add collateral, loan, and exit with dPrime", async function () {
            await lmcv.setPSMAddress(psm.address, true);

            // console.log(await psm.lmcv());
            // console.log(await psm.collateralJoin());
            // console.log(await psm.dPrime());
            // console.log(await psm.dPrimeJoin());
            // console.log(await psm.collateralName());
            // console.log(await psm.treasury() + "\n");

            // console.log(await collateralJoin.lmcv());
            // console.log(await collateralJoin.collateralContract());
            // console.log(await collateralJoin.lmcvProxy());
            // console.log(await collateralJoin.dec());
            // console.log(await collateralJoin.collateralName() + "\n");

            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["9990000000000"]); //10 zeroes not 18

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("999"));
            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("999"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("999"));
        });

        it("Should properly add collateral, loan, and exit with dPrime", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Should work properly with fee", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("20"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2dPrime = dPrime.connect(addr2);
            await user2dPrime.transfer(addr1.address, fwad("20"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("30"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Loan and repay work properly with rate increase but no other accounts", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("20"));
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2dPrime = dPrime.connect(addr2);
            await user2dPrime.transfer(addr1.address, fwad("20"));

            await lmcv.updateRate(fray(".1"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("30"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000")
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));
        });

        it("Loan and repay work properly with rate increase with normal accounts", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("4000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("20"));


            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2dPrime = dPrime.connect(addr2);
            await user2dPrime.transfer(addr1.address, fwad("20"));

            let collatJoin2Connect = collatJoinTwo.connect(addr1);
            await collatJoin2Connect.join(addr1.address, fwad("1000"));
            await userLMCV.loan([mockToken2Bytes], [fwad("1000")], fwad("500"), addr1.address);

            expect(await lmcv.totalPSMDebt()).to.equal(fwad("2000"));
            expect(await lmcv.totalDPrime()).to.equal(frad("2500"));


            await lmcv.updateRate(fray(".1"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("3999999990000000000000");
            expect(await lmcv.totalPSMDebt()).to.equal(fwad("1000"));

            expect(await lmcv.dPrime(owner.address)).to.equal(frad("80"))
            expect(await lmcv.totalDPrime()).to.equal(frad("1550"));
        });
    });
});

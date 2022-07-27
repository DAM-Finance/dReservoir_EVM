const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, USDCMock;
let collateralJoinFactory, collateralJoin;
let USDCMockBytes = ethers.utils.formatBytes32String("USDC");
let tokenTwo, tokenThree;
let collatJoinTwo, collatJoinThree;
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;
let lmcvProxy, lmcvProxyFactory;
let psm, psmFactory;
let userPSM;
let userDPrime;


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
    
    await mockTokenConnect.approve(collateralJoin.address);

    await mockTokenConnect.mint(fwad(amounts.at(0)));
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
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrime = await dPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        USDCMock = await tokenFactory.deploy("TSTR", 10);

        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, USDCMockBytes, USDCMock.address);
        
        await lmcv.administrate(collateralJoin.address, 1);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);
        await lmcv.setLiquidationMult(fray(".60"));
        
        await setupUser(addr1, ["2000", "2000", "2000"]);

        await lmcv.editAcceptedCollateralType(USDCMockBytes, fwad("10000"), fwad("1"), fray("1"), fray("0.00"), false);

        await lmcv.updateSpotPrice(USDCMockBytes, fray("1"));

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
        });

        it("Should properly add collateral, loan, and exit with dPrime", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));

            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("2000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("1999999990000000000000")
        });

        it("Should work properly with fee", async function () {
            await lmcv.setPSMAddress(psm.address, true);
            await userDPrime.approve(psm.address, fray("100000"));
            expect(await psm.collateralJoin()).to.equal(collateralJoin.address);
            await collateralJoin.rely(psm.address);

            await psm.setMintRepayFees(fray(".01"), fray(".01"));

            expect(await USDCMock.balanceOf(addr1.address)).to.equal("2000000000000000000000")

            await userPSM.createDPrime(addr1.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18
            await userPSM.createDPrime(addr2.address, [USDCMockBytes],["10000000000000"]); //10 zeroes not 18

            expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("990"));
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("990"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("20"));

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("2000"));

            let user2dPrime = dPrime.connect(addr2);
            await user2dPrime.transfer(addr1.address, fwad("20"));

            await userPSM.getCollateral(addr1.address, [USDCMockBytes], ["10000000000000"]);

            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));

            expect(await dPrime.balanceOf(addr1.address)).to.equal(0);
            expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("970"));
            expect(await lmcv.dPrime(owner.address)).to.equal(frad("30"));
            expect(await lmcv.lockedCollateral(psm.address, USDCMockBytes)).to.equal(fwad("1000"));
            expect(await USDCMock.balanceOf(addr1.address)).to.equal("1999999990000000000000")
        });
    });
});


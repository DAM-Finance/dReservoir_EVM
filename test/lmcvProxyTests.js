
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

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);

    await mockTokenConnect.approve(lmcvProxy.address, MAX_INT);
    await mockToken2Connect.approve(lmcvProxy.address, MAX_INT);
    await mockToken3Connect.approve(lmcvProxy.address, MAX_INT); 

    await mockTokenConnect.mint(addr.address, fwad("1000"));
    await mockToken2Connect.mint(addr.address, fwad("1000"));
    await mockToken3Connect.mint(addr.address, fwad("1000"));
}

describe("Testing LMCVProxy", function () {

    before(async function () {
        dPrimeFactory = await ethers.getContractFactory("dPrime");
        LMCVFactory = await ethers.getContractFactory("LMCV");
        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        tokenFactory = await ethers.getContractFactory("TestERC20");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

       
        dPrime = await dPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address, owner.address, fray("0.01"));

        mockToken = await tokenFactory.deploy("Tester", "TSTR");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("Tester2", "TST2");
        tokenThree = await tokenFactory.deploy("Tester3", "TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, mockToken2Bytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, mockToken3Bytes, tokenThree.address);


        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);
        await lmcv.administrate(dPrimeJoin.address, 1);
        await dPrime.rely(dPrimeJoin.address);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await lmcv.setPartialLiqMax(fray(".50"));
        await lmcv.setProtocolLiqFeeMult(fray(".015"));
        await lmcv.setLiquidationMult(fray(".60"));
        await lmcv.setLiquidationFloor(frad("10"));
        await lmcv.setWholeCDPLiqMult(fray(".75"));
        await lmcv.setProtocolFeeRemovalMult(fray(".92"));

        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
        await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));

        await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
        await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

        await lmcvProxy.setDPrimeJoin(dPrimeJoin.address);

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);

        await lmcvProxy.editCollateral(mockTokenBytes, collateralJoin.address, mockToken.address, MAX_INT);
        await lmcvProxy.editCollateral(mockToken2Bytes, collatJoinTwo.address, tokenTwo.address, MAX_INT);
        await lmcvProxy.editCollateral(mockToken3Bytes, collatJoinThree.address, tokenThree.address, MAX_INT);
    });

    describe("Loan function testing", function () {

        beforeEach(async function () {
            userLMCVProxy = lmcvProxy.connect(addr1);
        });

        it("Should properly add collateral, loan, and exit with dPrime", async function () {
            //Below calls are what website would have to do
            await setupUser(addr1, ["555", "666", "777"]);
            await userLMCV.proxyApprove(lmcvProxy.address);

            await userLMCVProxy.beginLoan(collateralBytesList, [fwad("100"), fwad("200"), fwad("300")], fwad("1000"));
        });
    });

});
const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, mockToken;
let collateralJoinFactory, collateralJoin;
let glmrBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let dotBytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let dPRIMEsBytes = ethers.utils.formatBytes32String("MOCKTOKENTHREE");
let tokenTwo, tokenThree;
let collatJoinTwo, collatJoinThree;
let collateralBytesList = [glmrBytes, dotBytes, dPRIMEsBytes];
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;
let lmcvProxy, lmcvProxyFactory;

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
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address, MAX_INT);
    await mockToken2Connect.approve(collatJoinTwo.address, MAX_INT);
    await mockToken3Connect.approve(collatJoinThree.address, MAX_INT);

    await mockTokenConnect.mint(fwad(amounts.at(0)));
    await mockToken2Connect.mint(fwad(amounts.at(1)));
    await mockToken3Connect.mint(fwad(amounts.at(2)));

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
        tokenFactory = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrime = await dPrimeFactory.deploy(ethers.constants.AddressZero);
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, glmrBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, dotBytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, dPRIMEsBytes, tokenThree.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await setupUser(addr1, ["2000", "2000", "2000"]);
        await setupUser(addr2, ["2000", "2000", "2000"]);
        await setupUser(addr3, ["0", "0", "0"]);

        await lmcv.editAcceptedCollateralType(glmrBytes, fwad("10000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(dotBytes, fwad("10000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(dPRIMEsBytes, fwad("10000"), fwad("1"), fray("0.6"), true);

        await lmcv.updateSpotPrice(glmrBytes, fray("1"));
        await lmcv.updateSpotPrice(dotBytes, fray("8"));
        await lmcv.updateSpotPrice(dPRIMEsBytes, fray("1"));

        userLMCV = lmcv.connect(addr1);
        userTwoLMCV = lmcv.connect(addr2);
        userThreeLMCV = lmcv.connect(addr3);
    });

    describe("Leverage testing", function () {
        it("getPortfolioValue should work", async function () {
            let collateralType3 = await lmcv.CollateralData(dPRIMEsBytes);
            expect(collateralType3['leveraged']).to.be.true;

            await lmcv.updateRate(fray(".1"));

            //First collateral loan
            await userLMCV.loan([glmrBytes, dotBytes], [fwad("1000"), fwad("200")], fwad("1181.8181818"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1299.99999998"));

            // //Loaning mockup of dPRIMEs
            await userLMCV.loan([dPRIMEsBytes], [fwad("1300")], fwad("590.90909"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1949.99999898"));
        });

        it("Loan and repayment should work with lower spot price - no minting fee or rate", async function () {
            let collateralType3 = await lmcv.CollateralData(dPRIMEsBytes);
            expect(collateralType3['leveraged']).to.be.true;

            await lmcv.updateRate(fray(".1"));
            await userLMCV.loan([glmrBytes, dotBytes], [fwad("1000"), fwad("200")], fwad("1181.8181818"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1299.99999998"));
            await userLMCV.loan([dPRIMEsBytes], [fwad("1300")], fwad("590.90909"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1949.99999898"));

            await lmcv.updateSpotPrice(dotBytes, fray("6"));
            await userLMCV.repay([glmrBytes, dotBytes, dPRIMEsBytes], [fwad("1000"), fwad("200"), fwad("1300")], await lmcv.normalizedDebt(addr1.address), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(0);
        });

        it("Loan and repayment should work - with rate", async function () {
            let collateralType3 = await lmcv.CollateralData(dPRIMEsBytes);
            expect(collateralType3['leveraged']).to.be.true;

            await lmcv.updateRate(fray(".1"));
            await userLMCV.loan([glmrBytes, dotBytes], [fwad("1000"), fwad("200")], fwad("1181.8181818"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1299.99999998"));
            await userLMCV.loan([dPRIMEsBytes], [fwad("1300")], fwad("590.90909"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1949.99999898"));

            await lmcv.updateSpotPrice(dotBytes, fray("6"));

            await userTwoLMCV.loan([glmrBytes], [fwad("2000")], fwad("909.09090909"), addr2.address);
            expect(await lmcv.dPrime(addr2.address)).to.equal(frad("999.999999999"));

            await userTwoLMCV.moveDPrime(addr2.address, addr1.address, frad("999.999999999"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("2949.999998979"));

            await lmcv.updateRate(fray(".1"));

            await userLMCV.repay([glmrBytes, dotBytes, dPRIMEsBytes], [fwad("1000"), fwad("200"), fwad("1300")], await lmcv.normalizedDebt(addr1.address), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("822.727272819"));
        });

        it("Lever tokens only", async function () {
            let collateralType3 = await lmcv.CollateralData(dPRIMEsBytes);
            expect(collateralType3['leveraged']).to.be.true;

            await userLMCV.loan([dPRIMEsBytes], [fwad("1000")], fwad("600"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("600"));
        });
    });
});


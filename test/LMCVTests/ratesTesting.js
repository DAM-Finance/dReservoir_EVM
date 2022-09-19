const {expect} = require("chai");
const {ethers, network} = require("hardhat");

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
let ratesUpdaterFactory, ratesUpdater;

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
        tokenFactory = await ethers.getContractFactory("MockTokenFour");
        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        ratesUpdaterFactory = await ethers.getContractFactory("RatesUpdater");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        dPrime = await dPrimeFactory.deploy(ethers.constants.AddressZero);
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockTokenBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken2Bytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken3Bytes, tokenThree.address);

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
    });

    describe("Loan() testing", function () {

        beforeEach(async function () {
            userLMCV = await lmcv.connect(addr1);
        });

        it("Should behave correctly when given collateral and debt accrued with 1 loan", async function () {
            //Total value of collateral: $6000
            //Total loanable amount: $3000
            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("2000"));

            await userTwoLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr2.address);
            expect(await userTwoLMCV.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await userTwoLMCV.dPrime(addr2.address)).to.equal(frad("2000"));

            await userTwoLMCV.moveDPrime(addr2.address, addr1.address, frad("2000"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("4000"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1.1"));

            await userLMCV.repay(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1800"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(0);
        });

        it("Should behave correctly when 2 loans taken out at different stability rates", async function () {

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await userLMCV.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("2000"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1.1"));

            expect(await lmcv.dPrime(owner.address)).to.equal(frad("200"));

            await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("4200"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("4000"));


            await userTwoLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr2.address);
            expect(await userTwoLMCV.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
            expect(await userTwoLMCV.dPrime(addr2.address)).to.equal(frad("2200"));

            await userTwoLMCV.moveDPrime(addr2.address, addr1.address, frad("2200"));
            expect(await userLMCV.dPrime(addr1.address)).to.equal(frad("6400"));

            await lmcv.updateRate(fray(".1"));
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1.2"));

            expect(await lmcv.dPrime(owner.address)).to.equal(frad("800"));

            await userLMCV.repay(collateralBytesList, [fwad("100"), fwad("200"), fwad("400")], fwad("4000"), addr1.address);
            expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1600"));
            expect(await lmcv.normalizedDebt(addr1.address)).to.equal(0);
            expect(await lmcv.totalNormalizedDebt()).to.equal(fwad("2000"));
        });

        it("Should be able to set stability rate, call accrue interest and have it update the accumulated rate", async function () {
            // Get a new rates updater contract.
            ratesUpdater = await ratesUpdaterFactory.deploy(lmcv.address);

            // Permission rates updater to call functinos on LMCV.
            await lmcv.administrate(ratesUpdater.address, 1);

            expect(await ratesUpdater.stabilityRate()).to.equal(fray("1"));

            // So user one can call accrue interest.
            userOneRatesUpdater = ratesUpdater.connect(addr1);

            // Accruing interest with a rate of one should have no effect.
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1"));

            // Change the stability rate to 5%.
            // We actually store the per second rate which is 1.05^(1/3153600)
            await ratesUpdater.changeStabilityRate(fray("1.00000000154713000000"));

            // Fast forward by one year.
            await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 365]);

            // Accrue interest after one year. We would expect the accumulated rate to be 5%.
            await userOneRatesUpdater.accrueInterest();
            const accumulatedfRate = await lmcv.AccumulatedRate();
            const fivePercent = ethers.BigNumber.from(fray("1.05"));
            expect(accumulatedfRate.gt(fivePercent)).equals(true);
        });

        it("Should be able to support negative rates", async function () {
            // Get a new rates updater contract.
            ratesUpdater = await ratesUpdaterFactory.deploy(lmcv.address);

            // Permission rates updater to call functinos on LMCV.
            await lmcv.administrate(ratesUpdater.address, 1);

            expect(await ratesUpdater.stabilityRate()).to.equal(fray("1"));

            // So user one can call accrue interest.
            userOneRatesUpdater = ratesUpdater.connect(addr1);

            // Accruing interest with a rate of one should have no effect.
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1"));

            // Change the stability rate to -5%.
            // We actually store the per second rate which is 0.95^(1/3153600)
            await ratesUpdater.changeStabilityRate(fray("0.9999999983735"));

            // Fast forward by one year.
            await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 365]);
            
            // Accrue interest after one year. We would expect the accumulated rate to be 5%.
            await userOneRatesUpdater.accrueInterest();
            const accumulatedRate = await lmcv.AccumulatedRate();
            const ninetyFivePercent = ethers.BigNumber.from(fray("0.95"));
            expect(accumulatedRate.lt(ninetyFivePercent)).equals(true);
        });

        it("Can change stability rate", async function () {
            // Get a new rates updater contract.
            ratesUpdater = await ratesUpdaterFactory.deploy(lmcv.address);

            // Permission rates updater to call functinos on LMCV.
            await lmcv.administrate(ratesUpdater.address, 1);

            expect(await ratesUpdater.stabilityRate()).to.equal(fray("1"));

            // So user one can call accrue interest.
            userOneRatesUpdater = ratesUpdater.connect(addr1);

            // Accruing interest with a rate of one should have no effect.
            expect(await lmcv.AccumulatedRate()).to.equal(fray("1"));

            // Change the stability rate to 5%.
            // We actually store the per second rate which is 1.05^(1/3153600)
            await ratesUpdater.changeStabilityRate(fray("1.00000000154713"));

            // Fast forward six months.
            await network.provider.send("evm_increaseTime", [15768000]);
            
            // Accrue interest after half a year. We would expect the accumulated rate to be around 2.46%.
            await userOneRatesUpdater.accrueInterest();
            let accumulatedRate = await lmcv.AccumulatedRate();
            const twoPointFourSixPc = ethers.BigNumber.from(fray("1.0246"));
            const twoPointFourSevenPc = ethers.BigNumber.from(fray("1.0247"));
            expect(accumulatedRate.gt(twoPointFourSixPc)).equals(true);
            expect(accumulatedRate.lt(twoPointFourSevenPc)).equals(true);

            // Change to 10% rate.
            await ratesUpdater.changeStabilityRate(fray("1.00000000302227"));

            // Fast forward another six months.
            await network.provider.send("evm_increaseTime", [15768000]);

            // Accrue interest after half a year. We would expect the accumulated rate to be around 7.46%
            // based on a rate of 5% for 6 months and then a rate of 10% for 6 months.
            await userOneRatesUpdater.accrueInterest();
            accumulatedRate = await lmcv.AccumulatedRate();
            const sevenPointFourSevenPc = ethers.BigNumber.from(fray("1.0747"));
            const sevenPointFourSevenOnePc = ethers.BigNumber.from(fray("1.07471"));
            expect(accumulatedRate.gt(sevenPointFourSevenPc)).equals(true);
            expect(accumulatedRate.lt(sevenPointFourSevenOnePc)).equals(true);
        });
    });
});


const { expect } = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}

let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let tokenFactory, mockToken;
let LMCVFactory, lmcv;
let owner, addr1, addr2, addrs;
let userDPrime, userDPrimeJoin;
let userLMCV;
let lmcvProxy, lmcvProxyFactory;

async function setupUser(addr, amount){
    let mockTokenConnect = mockToken.connect(addr);
    await mockTokenConnect.approve(collateralJoin.address);
    await mockTokenConnect.mint(fwad("1000"));

    let collatJoinConnect = collateralJoin.connect(addr);
    await collatJoinConnect.join(addr.address, fwad(amount));

    userDPrime = dPrime.connect(addr);
    await userDPrime.approve(dPrimeJoin.address, fwad("10000"));
}

describe("dPrimeJoin Testing", function () {
    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        LMCVFactory = await ethers.getContractFactory("LMCV");
        lmcv = await LMCVFactory.deploy();

        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, mockTokenBytes, mockToken.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(dPrimeJoin.address, 1);
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

        await dPrime.rely(dPrimeJoin.address);

        await setupUser(addr1, "1000");
        await setupUser(addr2, "1000");
        await lmcv.setMintFee(fray(".01"));

        userLMCV = lmcv.connect(addr1);
        userDPrimeJoin = dPrimeJoin.connect(addr1);

        userTwoLMCV = lmcv.connect(addr2);
        userTwoDPrimeJoin = dPrimeJoin.connect(addr2);
    });

    it("Should let user withdraw dPrime after loan has been called correctly", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

        await userLMCV.approveMultiple([userDPrimeJoin.address]);
        await userDPrimeJoin.exit(addr1.address, fwad("100"));

        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1880"));
        expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("100"));
        expect(await lmcv.dPrime(owner.address)).to.equal(frad("20"));
    });

    it("Should not let user withdraw dPrime greater than specified in normalizedDebt * AccumulatedRate", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

        await userLMCV.approveMultiple([userDPrimeJoin.address]);
        await userDPrimeJoin.exit(addr1.address, fwad("100"));

        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1880"));

        await expect(userDPrimeJoin.exit(addr1.address, fwad("1901"))).to.be.revertedWith("VM Exception while processing transaction:");
    });

    it("User cannot deposit dPrime with insufficient balance", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

        await userLMCV.approveMultiple([userDPrimeJoin.address]);
        await userDPrimeJoin.exit(addr1.address, fwad("1000"));

        await userTwoLMCV.approveMultiple([userDPrimeJoin.address]);
        await userTwoDPrimeJoin.exit(addr2.address, fwad("1000"));

        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("980"));

        // Fails because a fee was taken upon calling `userDPrimeJoin.exit`.
        await expect(userDPrimeJoin.join(addr1.address, fwad("1001"))).to.be.revertedWith("dPrime/insufficient-balance");
    });

    it("User can re-deposit a portion of their withdrawn dPRIME", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));

        await userLMCV.approveMultiple([userDPrimeJoin.address]);
        await userDPrimeJoin.exit(addr1.address, fwad("1000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("980"));

        await userDPrimeJoin.join(addr1.address, fwad("500"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1480"));
    });

    it("User receives dPRIME externally and re-deposits", async function () {
        await userLMCV.approveMultiple([userDPrimeJoin.address]);
        await userTwoLMCV.approveMultiple([userTwoDPrimeJoin.address]);

        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("1980"));

        await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
        expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr2.address)).to.equal(frad("1980"));

        await userDPrimeJoin.exit(addr1.address, fwad("1000"));
        expect(await lmcv.normalizedDebt(addr1.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("980"));

        await userTwoDPrimeJoin.exit(addr2.address, fwad("1000"));
        expect(await lmcv.normalizedDebt(addr2.address)).to.equal(fwad("2000"));
        expect(await lmcv.dPrime(addr2.address)).to.equal(frad("980"));

        //transfer to user1 then user 1 repays fully
        userTwoDPrime = dPrime.connect(addr2);

        await userTwoDPrime.transfer(addr1.address, fwad("500"));
        expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("1500"));
        expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("500"));

        await userDPrimeJoin.join(addr1.address, fwad("1500"));
        expect(await lmcv.dPrime(addr1.address)).to.equal(frad("2480"));
    });

});

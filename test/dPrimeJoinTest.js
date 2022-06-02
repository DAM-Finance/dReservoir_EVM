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

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, owner.address, fray("0.01"));

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(dPrimeJoin.address, 1);
        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("10000"), fwad("1"), fray("0.5"), fray("0.08"));

        debtCeiling = frad("50000");
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await lmcv.setLiquidationMult(fray(".60"));
        await lmcv.updateSpotPrice(mockTokenBytes, fray("10"));

        await dPrime.rely(dPrimeJoin.address);

        await setupUser(addr1, "1000");
        await setupUser(addr2, "1000");

        userLMCV = lmcv.connect(addr1);
        userDPrimeJoin = dPrimeJoin.connect(addr1);

        userTwoLMCV = lmcv.connect(addr2);
        userTwoDPrimeJoin = dPrimeJoin.connect(addr2);
    });

    it("Should let user withdraw dPrime after loan has been called correctly", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));

        await userLMCV.proxyApprove(userDPrimeJoin.address);
        await userDPrimeJoin.exit(addr1.address, fwad("100"));

        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("100"));
        expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("99"));
        expect(await dPrime.balanceOf(owner.address)).to.equal(fwad("1"));
    });

    it("Should not let user withdraw dPrime greater than specified in debtDPrime", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));

        await userLMCV.proxyApprove(userDPrimeJoin.address);
        await userDPrimeJoin.exit(addr1.address, fwad("100"));

        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("100"));

        await expect(userDPrimeJoin.exit(addr1.address, fwad("1901"))).to.be.revertedWith("LMCV/Cannot withdraw more dPrime than debt allows");
    });

    it("User cannot repay dPrime with insufficient balance", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));

        await userLMCV.proxyApprove(userDPrimeJoin.address);
        await userDPrimeJoin.exit(addr1.address, fwad("1000"));

        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1000"));

        await expect(userDPrimeJoin.join(addr1.address, fwad("1000"))).to.be.revertedWith("dPrime/insufficient-balance");
    });

    it("User can repay portion of loan", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));

        await userLMCV.proxyApprove(userDPrimeJoin.address);
        await userDPrimeJoin.exit(addr1.address, fwad("1000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1000"));

        await userDPrimeJoin.join(addr1.address, fwad("500"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("500"));
    });

    it("User gets more dPrime and over repays resulting in failure then properly repays fully", async function () {
        await userLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr1.address);
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));
        await userLMCV.proxyApprove(userDPrimeJoin.address);
        await userDPrimeJoin.exit(addr1.address, fwad("1000"));
        expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1000"));

        await userTwoLMCV.loan([mockTokenBytes], [fwad("500")], fwad("2000"), addr2.address);
        expect(await lmcv.debtDPrime(addr2.address)).to.equal(frad("2000"));
        await userTwoLMCV.proxyApprove(userTwoDPrimeJoin.address);
        await userTwoDPrimeJoin.exit(addr2.address, fwad("1000"));
        expect(await lmcv.debtDPrime(addr2.address)).to.equal(frad("2000"));
        expect(await lmcv.withdrawnDPrime(addr2.address)).to.equal(frad("1000"));

        //transfer to user1 then user 1 repays fully
        userTwoDPrime = dPrime.connect(addr2);

        await userTwoDPrime.transfer(addr1.address, fwad("500"));
        expect(await dPrime.balanceOf(addr1.address)).to.equal(fwad("1490"));
        expect(await dPrime.balanceOf(addr2.address)).to.equal(fwad("490"));

        await expect(userDPrimeJoin.join(addr1.address, fwad("1490"))).to.be.reverted;

        await userDPrimeJoin.join(addr1.address, fwad("1000"));
        expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal("0");
    });

    //Check under and overflow working 
});

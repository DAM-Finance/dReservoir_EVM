const {expect} = require("chai");
const {ethers} = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

// Token types.
let fooBytes = ethers.utils.formatBytes32String("FOO");
let barBytes = ethers.utils.formatBytes32String("BAR");
let bazBytes = ethers.utils.formatBytes32String("BAZ");

// Accounts.
let owner, addr1, addr2, addr3, addrs;

// Contracts and contract factories.
let ddPrimeFactory, ddPrime;
let ddPrimeJoinFactory, ddPrimeJoin;
let stakingVaultFactory, stakingVault;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz;
let rewardJoinFactory, fooJoin, barJoin, bazJoin;

// LMCV settings.
let DEBT_CEILING = frad("50000");

// Mint a bunch of tokens and deposit some specified amount of them in the protocol.
async function setupUser(user, amounts) {
    let fooConnect = foo.connect(user);
    let barConnect = bar.connect(user);
    let bazConnect = baz.connect(user);

    await fooConnect.mint(fwad(amounts.at(0)));
    await barConnect.mint(fwad(amounts.at(1)));
    await bazConnect.mint(fwad(amounts.at(2)));

    await fooConnect.approve(fooJoin.address);
    await barConnect.approve(barJoin.address);
    await bazConnect.approve(bazJoin.address);
}


describe("Testing RewardJoins", function () {

    before(async function () {
        ddPrimeFactory              = await ethers.getContractFactory("dPrime");
        LMCVFactory                 = await ethers.getContractFactory("LMCV");
        stakingVaultFactory         = await ethers.getContractFactory("StakingVault");
        ddPrimeJoinFactory          = await ethers.getContractFactory("ddPrimeJoin");
        tokenFactory                = await ethers.getContractFactory("MockTokenTwo");
        rewardJoinFactory           = await ethers.getContractFactory("RewardJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        ddPrime = await ddPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        stakingVault = await stakingVaultFactory.deploy(lmcv.address);
        ddPrimeJoin = await ddPrimeJoinFactory.deploy(stakingVault.address, ddPrime.address);

        foo = await tokenFactory.deploy("FOO");
        bar = await tokenFactory.deploy("BAR");
        baz = await tokenFactory.deploy("BAZ");

        fooJoin = await rewardJoinFactory.deploy(stakingVault.address, fooBytes, foo.address);
        barJoin = await rewardJoinFactory.deploy(stakingVault.address, barBytes, bar.address);
        bazJoin = await rewardJoinFactory.deploy(stakingVault.address, bazBytes, baz.address);


        await stakingVault.administrate(fooJoin.address, 1);
        await stakingVault.administrate(barJoin.address, 1);
        await stakingVault.administrate(bazJoin.address, 1);

        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

        await setupUser(owner, ["2000", "2000", "2000"]);
        await setupUser(addr1, ["2000", "2000", "2000"]);
        await setupUser(addr2, ["2000", "2000", "2000"]);
        await setupUser(addr3, ["0", "0", "0"]);

        await stakingVault.editRewardsToken(fooBytes, true, fray("1"), 0);
        await stakingVault.editRewardsToken(barBytes, true, fray("1"), 0);
    });

    it("Rewards added by admin works properly", async function () {
        await fooJoin.join(fwad("1000"));

        let RewardTokenData = await stakingVault.RewardTokenData(fooBytes);
        expect(RewardTokenData['spotPrice']).to.equal(fray("1"));
        expect(RewardTokenData['amount']).to.equal(fwad("1000"));
        expect(await foo.balanceOf(owner.address)).to.equal(fwad("1000"));
    });

    it("Rewards removed by admin works properly", async function () {
        await fooJoin.join(fwad("1000"));
        await fooJoin.remove(fwad("500"));

        let RewardTokenData = await stakingVault.RewardTokenData(fooBytes);
        expect(RewardTokenData['amount']).to.equal(fwad("500"));
        expect(await foo.balanceOf(owner.address)).to.equal(fwad("1500"));
    });

    it("More added than user has fails", async function () {
        await expect(fooJoin.join(fwad("2001"))).to.be.revertedWith("token-insufficient-balance")
    });

    it("Overflow removal fails", async function () {
        await fooJoin.join(fwad("1000"));
        await expect(fooJoin.remove(fwad("5000"))).to.be.reverted;
    });

    //TODO:Test pull once stake functionality works

});
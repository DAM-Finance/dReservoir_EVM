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
let rewardJoinFactory, fooJoin, barJoin;
let stakeJoinFactory, stakeJoin;

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
    await bazConnect.approve(stakeJoin.address);
}


describe("Testing RewardJoins", function () {

    before(async function () {
        ddPrimeFactory              = await ethers.getContractFactory("ddPrime");
        LMCVFactory                 = await ethers.getContractFactory("LMCV");
        stakingVaultFactory         = await ethers.getContractFactory("StakingVault");
        ddPrimeJoinFactory          = await ethers.getContractFactory("ddPrimeJoin");
        tokenFactory                = await ethers.getContractFactory("MockTokenTwo");
        rewardJoinFactory           = await ethers.getContractFactory("RewardJoin");
        stakeJoinFactory            = await ethers.getContractFactory("StakeJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        ddPrime = await ddPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        stakingVault = await stakingVaultFactory.deploy(bazBytes, ddPrime.address, lmcv.address);
        ddPrimeJoin = await ddPrimeJoinFactory.deploy(stakingVault.address, ddPrime.address);

        foo = await tokenFactory.deploy("FOO");
        bar = await tokenFactory.deploy("BAR");
        baz = await tokenFactory.deploy("BAZ");

        fooJoin = await rewardJoinFactory.deploy(stakingVault.address, fooBytes, foo.address);
        barJoin = await rewardJoinFactory.deploy(stakingVault.address, barBytes, bar.address);
        stakeJoin = await stakeJoinFactory.deploy(stakingVault.address, bazBytes, baz.address);

        await stakingVault.administrate(fooJoin.address, 1);
        await stakingVault.administrate(barJoin.address, 1);
        await stakingVault.administrate(stakeJoin.address, 1);

        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

        await setupUser(owner, ["2000", "2000", "15000"]);
        await setupUser(addr1, ["2000", "2000", "15000"]);
        await setupUser(addr2, ["2000", "2000", "2000"]);
        await setupUser(addr3, ["0", "0", "0"]);

        await stakingVault.editRewardsTokenList(fooBytes, true, 0);
        await stakingVault.setStakedAmountLimit(fwad("5000"));
    });

    it("Admin setters work properly", async function () {
        await stakingVault.setStakedAmountLimit(fwad("10000"));
        expect(await stakingVault.stakedAmountLimit()).to.equal(fwad("10000"));
    });

    it("User adding tokens works for unlocked stakeable token", async function () {
        let userStakeJoin = stakeJoin.connect(addr1);
        await userStakeJoin.join(addr1.address, fwad("1000"));
        expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("1000"));
        expect(await baz.balanceOf(addr1.address)).to.equal(fwad("14000"));
    });

    it("Withdrawing unlocked tokens works", async function () {
        let userStakeJoin = stakeJoin.connect(addr1);
        await userStakeJoin.join(addr1.address, fwad("1000"));
        expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("1000"));
        expect(await baz.balanceOf(addr1.address)).to.equal(fwad("14000"));

        await userStakeJoin.exit(addr1.address, fwad("500"));
        expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("500"));
        expect(await baz.balanceOf(addr1.address)).to.equal(fwad("14500"));

        await userStakeJoin.exit(addr1.address, fwad("500"));
        expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(0);
        expect(await baz.balanceOf(addr1.address)).to.equal(fwad("15000"));
    });

    it("More added than user has fails", async function () {
        let userStakeJoin = stakeJoin.connect(addr1);
        await expect(userStakeJoin.join(addr1.address, fwad("15001"))).to.be.revertedWith("token-insufficient-balance")
    });

    it("Overflow removal fails", async function () {
        let userStakeJoin = stakeJoin.connect(addr1);
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await expect(userStakeJoin.exit(fwad("5000"))).to.be.reverted;
    });

});
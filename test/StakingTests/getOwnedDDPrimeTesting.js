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
let blorpBytes = ethers.utils.formatBytes32String("BLROP");
let ddPrimeBytes = ethers.utils.formatBytes32String("DDPRIME");

// Accounts.
let owner, addr1, addr2, addr3, addrs;

// Contracts and contract factories.
let ddPrimeFactory, ddPrime;
let ddPrimeJoinFactory, ddPrimeJoin;
let stakingVaultFactory, stakingVault;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz, blorp;
let rewardJoinFactory, fooJoin, barJoin;
let stakeJoinFactory, stakeJoin;
let userStakeJoin, userStakeJoin2, userStakeJoin3;
let userSV, userSV2, userSV3;
let collateralJoinFactory, collateralJoin, ddPrimeCollateralJoin;
let lmcvProxy, lmcvProxyFactory;

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


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

    await fooConnect.approve(fooJoin.address, MAX_INT);
    await barConnect.approve(barJoin.address, MAX_INT);
    await bazConnect.approve(stakeJoin.address, MAX_INT);
}


describe("Testing checkDDPrimeOwnership", function () {

    before(async function () {
        ddPrimeFactory              = await ethers.getContractFactory("ddPrime");
        LMCVFactory                 = await ethers.getContractFactory("LMCV");
        lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
        stakingVaultFactory         = await ethers.getContractFactory("StakingVault");
        ddPrimeJoinFactory          = await ethers.getContractFactory("ddPrimeJoin");
        tokenFactory                = await ethers.getContractFactory("MockTokenFour");
        rewardJoinFactory           = await ethers.getContractFactory("RewardJoin");
        stakeJoinFactory            = await ethers.getContractFactory("StakeJoin");
        collateralJoinFactory       = await ethers.getContractFactory("CollateralJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        ddPrime = await ddPrimeFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        stakingVault = await stakingVaultFactory.deploy(ddPrimeBytes, ddPrime.address, lmcv.address);
        ddPrimeJoin = await ddPrimeJoinFactory.deploy(stakingVault.address, ddPrime.address);

        foo     = await tokenFactory.deploy("FOO");
        bar     = await tokenFactory.deploy("BAR");
        baz     = await tokenFactory.deploy("BAZ");
        blorp   = await tokenFactory.deploy("BLORP");

        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

        collateralJoin  = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, blorpBytes, blorp.address);
        await lmcv.administrate(collateralJoin.address, 1);

        ddPrimeCollateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, ddPrimeBytes, ddPrime.address);
        await lmcv.administrate(ddPrimeCollateralJoin.address, 1);

        let blorpConnect = blorp.connect(addr1);
        await blorpConnect.mint(fwad("10000"));
        await blorpConnect.approve(collateralJoin.address, MAX_INT);

        let collatJoinConnect = collateralJoin.connect(addr1);
        await collatJoinConnect.join(addr1.address, fwad("10000"));

        await lmcv.updateSpotPrice(blorpBytes, fray("40"));
        await lmcv.updateSpotPrice(ddPrimeBytes, fray("40"));

        await lmcv.editAcceptedCollateralType(blorpBytes, fwad("10000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(ddPrimeBytes, fwad("10000"), fwad("1"), fray("0.1"), true);


        fooJoin         = await rewardJoinFactory.deploy(stakingVault.address, fooBytes, foo.address);
        barJoin         = await rewardJoinFactory.deploy(stakingVault.address, barBytes, bar.address);
        stakeJoin       = await stakeJoinFactory.deploy(stakingVault.address, bazBytes, baz.address);
        

        await stakingVault.administrate(fooJoin.address, 1);
        await stakingVault.administrate(barJoin.address, 1);
        await stakingVault.administrate(stakeJoin.address, 1);
        
        await ddPrime.rely(ddPrimeJoin.address);
        

        await setupUser(owner, ["2000", "2000", "15000"]);
        await setupUser(addr1, ["0", "0", "15000"]);
        await setupUser(addr2, ["0", "0", "15000"]);
        await setupUser(addr3, ["0", "0", "15000"]);

        await stakingVault.editRewardsTokenList(fooBytes, true, 0);
        await stakingVault.editRewardsTokenList(barBytes, true, 0);
        await stakingVault.setStakedAmountLimit(fwad("5000"));
        await stakingVault.setStakedMintRatio(fray("1"));

        userStakeJoin = stakeJoin.connect(addr1);
        userSV = stakingVault.connect(addr1);

        userStakeJoin2 = stakeJoin.connect(addr2);
        userSV2 = stakingVault.connect(addr2);

        userStakeJoin3 = stakeJoin.connect(addr3);
        userSV3 = stakingVault.connect(addr3);
    });

    it("Stake function should work properly when ddPrime is locked in LMCV", async function () {

        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.ddPrime(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve ddPrime to exit 
        await userSV.approve(ddPrimeJoin.address);

        let userDDPrimeJoin = ddPrimeJoin.connect(addr1);
        await userDDPrimeJoin.exit(addr1.address, fwad("1000"));

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));

        // //Set up ddPrime in LMCV

        let userDDPRIME = ddPrime.connect(addr1);
        await userDDPRIME.approve(ddPrimeCollateralJoin.address, MAX_INT);

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));

        let ddPrimeCollatJoinConnect = ddPrimeCollateralJoin.connect(addr1);
        await ddPrimeCollatJoinConnect.join(addr1.address, fwad("1000"));

        expect(await lmcv.unlockedCollateral(addr1.address, ddPrimeBytes)).to.equal(fwad("1000"));
        expect(await ddPrime.balanceOf(addr1.address)).to.equal(0);

        await userLMCV.loan([ddPrimeBytes], [fwad("1000")], "0", addr1.address);

        expect(await stakingVault.getOwnedDDPrime(addr1.address)).to.equal(frad("1000"))
    });

    it("Stake function should work properly when ddPrime is in wallet of user", async function () {
        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.ddPrime(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve ddPrime to exit 
        await userSV.approve(ddPrimeJoin.address);

        let userDDPrimeJoin = ddPrimeJoin.connect(addr1);
        await userDDPrimeJoin.exit(addr1.address, fwad("1000"));

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));

        //Set up ddPrime in LMCV

        let userDDPRIME = ddPrime.connect(addr1);
        await userDDPRIME.approve(ddPrimeCollateralJoin.address, MAX_INT);

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));
        expect(await stakingVault.getOwnedDDPrime(addr1.address)).to.equal(frad("1000"));
    });

    it("Stake function should not work when none of conditions are true", async function () {
        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.ddPrime(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve ddPrime to exit 
        await userSV.approve(ddPrimeJoin.address);

        let userDDPrimeJoin = ddPrimeJoin.connect(addr1);
        await userDDPrimeJoin.exit(addr1.address, fwad("1000"));

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));

        //Set up ddPrime in LMCV
        let userDDPRIME = ddPrime.connect(addr1);
        await userDDPRIME.approve(ddPrimeCollateralJoin.address, MAX_INT);

        expect(await ddPrime.balanceOf(addr1.address)).to.equal(fwad("1000"));
        await userDDPRIME.transfer(addr2.address, fwad("1000"));
        expect(await stakingVault.getOwnedDDPrime(addr1.address)).to.equal("0");
    });
});
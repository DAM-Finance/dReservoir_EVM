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
let d3OBytes = ethers.utils.formatBytes32String("DDPRIME");

// Accounts.
let owner, addr1, addr2, addr3, addrs;

// Contracts and contract factories.
let d3OFactory, d3O;
let d3OJoinFactory, d3OJoin;
let stakingVaultFactory, stakingVault;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz, blorp;
let rewardJoinFactory, fooJoin, barJoin;
let stakeJoinFactory, stakeJoin;
let userStakeJoin, userStakeJoin2, userStakeJoin3;
let userSV, userSV2, userSV3;
let collateralJoinFactory, collateralJoin, d3OCollateralJoin;
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


describe("Testing checkD3OOwnership", function () {

    before(async function () {
        d3OFactory                  = await ethers.getContractFactory("d3O");
        LMCVFactory                 = await ethers.getContractFactory("LMCV");
        lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
        stakingVaultFactory         = await ethers.getContractFactory("StakingVault");
        d3OJoinFactory              = await ethers.getContractFactory("d3OJoin");
        tokenFactory                = await ethers.getContractFactory("MockTokenFour");
        rewardJoinFactory           = await ethers.getContractFactory("RewardJoin");
        stakeJoinFactory            = await ethers.getContractFactory("StakeJoin");
        collateralJoinFactory       = await ethers.getContractFactory("CollateralJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        d3O = await d3OFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
        stakingVault = await stakingVaultFactory.deploy(d3OBytes, d3O.address, lmcv.address);
        d3OJoin = await d3OJoinFactory.deploy(stakingVault.address, d3O.address);

        foo     = await tokenFactory.deploy("FOO");
        bar     = await tokenFactory.deploy("BAR");
        baz     = await tokenFactory.deploy("BAZ");
        blorp   = await tokenFactory.deploy("BLORP");

        await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

        collateralJoin  = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, blorpBytes, blorp.address);
        await lmcv.administrate(collateralJoin.address, 1);

        d3OCollateralJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, d3OBytes, d3O.address);
        await lmcv.administrate(d3OCollateralJoin.address, 1);

        let blorpConnect = blorp.connect(addr1);
        await blorpConnect.mint(fwad("10000"));
        await blorpConnect.approve(collateralJoin.address, MAX_INT);

        let collatJoinConnect = collateralJoin.connect(addr1);
        await collatJoinConnect.join(addr1.address, fwad("10000"));

        await lmcv.updateSpotPrice(blorpBytes, fray("40"));
        await lmcv.updateSpotPrice(d3OBytes, fray("40"));

        await lmcv.editAcceptedCollateralType(blorpBytes, fwad("10000"), fwad("1"), fray("0.5"), false);
        await lmcv.editAcceptedCollateralType(d3OBytes, fwad("10000"), fwad("1"), fray("0.1"), true);


        fooJoin         = await rewardJoinFactory.deploy(stakingVault.address, fooBytes, foo.address);
        barJoin         = await rewardJoinFactory.deploy(stakingVault.address, barBytes, bar.address);
        stakeJoin       = await stakeJoinFactory.deploy(stakingVault.address, bazBytes, baz.address);
        

        await stakingVault.administrate(fooJoin.address, 1);
        await stakingVault.administrate(barJoin.address, 1);
        await stakingVault.administrate(stakeJoin.address, 1);
        
        await d3O.rely(d3OJoin.address);
        

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

    it("Stake function should work properly when d3O is locked in LMCV", async function () {

        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.d3O(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve d3O to exit 
        await userSV.approve(d3OJoin.address);

        let userD3OJoin = d3OJoin.connect(addr1);
        await userD3OJoin.exit(addr1.address, fwad("1000"));

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));

        // //Set up d3O in LMCV

        let userDDPRIME = d3O.connect(addr1);
        await userDDPRIME.approve(d3OCollateralJoin.address, MAX_INT);

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));

        let d3OCollatJoinConnect = d3OCollateralJoin.connect(addr1);
        await d3OCollatJoinConnect.join(addr1.address, fwad("1000"));

        expect(await lmcv.unlockedCollateral(addr1.address, d3OBytes)).to.equal(fwad("1000"));
        expect(await d3O.balanceOf(addr1.address)).to.equal(0);

        await userLMCV.loan([d3OBytes], [fwad("1000")], "0", addr1.address);

        expect(await stakingVault.getOwnedD3O(addr1.address)).to.equal(frad("1000"))
    });

    it("Stake function should work properly when d3O is in wallet of user", async function () {
        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.d3O(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve d3O to exit 
        await userSV.approve(d3OJoin.address);

        let userD3OJoin = d3OJoin.connect(addr1);
        await userD3OJoin.exit(addr1.address, fwad("1000"));

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));

        //Set up d3O in LMCV

        let userDDPRIME = d3O.connect(addr1);
        await userDDPRIME.approve(d3OCollateralJoin.address, MAX_INT);

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));
        expect(await stakingVault.getOwnedD3O(addr1.address)).to.equal(frad("1000"));
    });

    it("Stake function should not work when none of conditions are true", async function () {
        //Set up LMCV
        let userLMCV = lmcv.connect(addr1);
        await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr1.address);

        //Stake with LP tokens
        await userStakeJoin.join(addr1.address, fwad("1000"));
        await userSV.stake(fwad("1000"), addr1.address);

        expect(await stakingVault.d3O(addr1.address)).to.equal(frad("1000"));
        expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("1000"));

        //Have to approve d3O to exit 
        await userSV.approve(d3OJoin.address);

        let userD3OJoin = d3OJoin.connect(addr1);
        await userD3OJoin.exit(addr1.address, fwad("1000"));

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));

        //Set up d3O in LMCV
        let userDDPRIME = d3O.connect(addr1);
        await userDDPRIME.approve(d3OCollateralJoin.address, MAX_INT);

        expect(await d3O.balanceOf(addr1.address)).to.equal(fwad("1000"));
        await userDDPRIME.transfer(addr2.address, fwad("1000"));
        expect(await stakingVault.getOwnedD3O(addr1.address)).to.equal("0");
    });
});
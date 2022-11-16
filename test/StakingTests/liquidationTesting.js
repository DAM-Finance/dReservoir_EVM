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
let owner, addr1, addr2, addr3, addr4, addrs;

// Contracts and contract factories.
let d3OFactory, d3O;
let d3OJoinFactory, d3OJoin;
let stakingVaultFactory, stakingVault;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz, blorp;
let rewardJoinFactory, fooJoin, barJoin;
let stakeJoinFactory, stakeJoin;
let userStakeJoin, userStakeJoin2, userStakeJoin3, userStakeJoin4;
let userSV, userSV2, userSV3, userSV4;
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

async function setupLiquidatedUser(){
    let userLMCV;
    let userD3OJoin;
    let userDDPRIME;
    let d3OCollatJoinConnect;

    let blorpConnect = blorp.connect(addr4);
    await blorpConnect.mint(fwad("10000"));
    await blorpConnect.approve(collateralJoin.address, MAX_INT);

    let collatJoinConnect = collateralJoin.connect(addr4);
    await collatJoinConnect.join(addr4.address, fwad("10000"));

    //Set up LMCV
    userLMCV = lmcv.connect(addr4);
    await userLMCV.loan([blorpBytes], [fwad("1000")], fwad("100"), addr4.address);

    //Stake with LP tokens
    await userStakeJoin4.join(addr4.address, fwad("1000"));
    await userSV4.stake(fwad("1000"), addr4.address);

    //Have to approve d3O to exit 
    await userSV4.approve(d3OJoin.address);

    userD3OJoin = d3OJoin.connect(addr4);
    await userD3OJoin.exit(addr4.address, fwad("1000"));

    //Set up d3O in LMCV
    userDDPRIME = d3O.connect(addr4);
    await userDDPRIME.approve(d3OCollateralJoin.address, MAX_INT);

    d3OCollatJoinConnect = d3OCollateralJoin.connect(addr4);
    await d3OCollatJoinConnect.join(addr4.address, fwad("1000"));

    await userLMCV.loan([d3OBytes], [fwad("1000")], "0", addr4.address);
}

async function setupStakingScenario(){
    //User 1 adds 1000 stakeable coin with join contract, and stake only 800 of it
    await userStakeJoin.join(addr1.address, fwad("1000"));
    await userSV.stake(fwad("800"), addr1.address);
    
    //User 2 adds 1000 stakeable coin with join contract, and stake only 300 of it
    await userStakeJoin2.join(addr2.address, fwad("1000"));
    await userSV2.stake(fwad("300"), addr2.address);

    // Foo Rewards get added
    await fooJoin.join(fwad("20"));

    //User 1 stakes 0 to claim rewards
    await userSV.stake("0", addr1.address);

    let userFooJoin1 = fooJoin.connect(addr1);
    await userFooJoin1.exit(addr1.address, "14545454545454545454");

    //Third user stakes 2000 - has reward debt but no withdrawable rewards
    //This is how history is tracked
    await userStakeJoin3.join(addr3.address, fwad("2000"));
    await userSV3.stake(fwad("2000"), addr3.address);

    //More foo rewards are added and bar rewards are introduced
    await fooJoin.join(fwad("5"));
    await barJoin.join(fwad("100"));

    // All users call stake again to get their rewards
    // User 1
    await userSV.stake("0", addr1.address);

    //User 2
    await userSV2.stake("0", addr2.address);

    //User 3
    await userSV3.stake("0", addr3.address);

    //All users withdraw all of their rewards
    let userFooJoin2 = fooJoin.connect(addr2);
    let userFooJoin3 = fooJoin.connect(addr3);
    await userFooJoin1.exit(addr1.address, "1290322580645161290");
    await userFooJoin2.exit(addr2.address, "5938416422287390029");
    await userFooJoin3.exit(addr3.address, "3225806451612903226");

    let userBarJoin1 = barJoin.connect(addr1);
    let userBarJoin2 = barJoin.connect(addr2);
    let userBarJoin3 = barJoin.connect(addr3);

    await userBarJoin1.exit(addr1.address, "25806451612903225806");
    await userBarJoin2.exit(addr2.address, "9677419354838709677");
    await userBarJoin3.exit(addr3.address, "64516129032258064516");
}


describe("Testing Liquidation of d3O", function () {

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
        [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();

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
        await setupUser(addr4, ["0", "0", "15000"]);

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

        userStakeJoin4 = stakeJoin.connect(addr4);
        userSV4 = stakingVault.connect(addr4);
    });

    describe("Testing Liquidation of d3O", function () {
        beforeEach(async function () {
            await setupStakingScenario();
            await setupLiquidatedUser();
        });

        it("When user is fully liquidated and they HAVE claimed their rewards before liquidation", async function () {
            // Sanity checks
            expect(await lmcv.lockedCollateral(addr4.address, d3OBytes)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(addr4.address, blorpBytes)).to.equal(fwad("1000"));
            expect(await d3O.balanceOf(addr4.address)).to.equal(0);
            expect(await stakingVault.d3O(addr4.address)).to.equal(0);
            expect(await stakingVault.getOwnedD3O(addr4.address)).to.equal(frad("1000"));
            expect(await lmcv.normalizedDebt(addr4.address)).to.equal(fwad("100"));

            await fooJoin.join(fwad("100"));

            await userSV4.stake(0, addr4.address);
            expect(await stakingVault.withdrawableRewards(addr4.address, fooBytes)).to.equal("24390243902439024390");
            expect(await stakingVault.rewardDebt(addr4.address, fooBytes)).to.equal("44184965310063657821");

            // User 1 gets liquidated, d3O is transferred to user 2 (bypasses auction functionality)
            await lmcv.seize([d3OBytes], [fwad("1000")], fwad("100"), addr4.address, addr2.address, owner.address);

            expect(await lmcv.lockedCollateral(addr4.address, d3OBytes)).to.equal(0);
            expect(await lmcv.lockedCollateral(addr4.address, blorpBytes)).to.equal(fwad("1000"));
            expect(await d3O.balanceOf(addr4.address)).to.equal(0);
            expect(await stakingVault.d3O(addr4.address)).to.equal(0);
            expect(await stakingVault.getOwnedD3O(addr4.address)).to.equal(0);
            expect(await lmcv.normalizedDebt(addr4.address)).to.equal(0);

            //User 2 gets d3O
            expect(await lmcv.unlockedCollateral(addr2.address, d3OBytes)).to.equal(fwad("1000"));
            
            let user2d3OCollatJoin = d3OCollateralJoin.connect(addr2);
            await user2d3OCollatJoin.exit(addr2.address, fwad("1000"));

            expect(await d3O.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
            expect(await stakingVault.getOwnedD3O(addr2.address)).to.equal(frad("1300"));

            let user2d3OJoin = d3OJoin.connect(addr2);
            await user2d3OJoin.join(addr2.address, fwad("1000"));

            expect(await d3O.balanceOf(addr2.address)).to.equal(0);
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("1300"));

            //LiquidationWithdraws 1000 LP token
            await userSV2.liquidationWithdraw(addr2.address, addr4.address, frad("1000"));

            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("1700"));

            expect(await stakingVault.totalD3O()).to.equal(frad("3100"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("3100"));

            // All users claim their rewards
            await userSV.stake(0, addr1.address);
            await userSV2.stake(0, addr2.address);
            await userSV3.stake(0, addr3.address);

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("19512195121951219513");
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("35347972248050926257"); 

            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("7317073170731707317");
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal("13255489593019097346"); 

            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("48780487804878048780");
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("88369930620127315642"); 

            let userFooJoin1 = fooJoin.connect(addr1);
            let userFooJoin2 = fooJoin.connect(addr2);
            let userFooJoin3 = fooJoin.connect(addr3);
            let userFooJoin4 = fooJoin.connect(addr4);
            await userFooJoin1.exit(addr1.address, "19512195121951219513");
            await userFooJoin2.exit(addr2.address, "7317073170731707317");
            await userFooJoin3.exit(addr3.address, "48780487804878048780");
            await userFooJoin4.exit(addr4.address, "24390243902439024390");

            await fooJoin.join(fwad("50"));

            //All users claim their rewards
            await userSV.stake(fwad("-800"), addr1.address);
            await userSV2.stake(fwad("-300"), addr2.address);
            await userSV3.stake(fwad("-2000"), addr3.address);

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("12903225806451612903");
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("4838709677419354839");
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("32258064516129032258");
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal("0");
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("0");
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("0");

            userFooJoin1 = fooJoin.connect(addr1);
            userFooJoin2 = fooJoin.connect(addr2);
            userFooJoin3 = fooJoin.connect(addr3);
            await userFooJoin1.exit(addr1.address, "12903225806451612903");
            await userFooJoin2.exit(addr2.address, "4838709677419354839");
            await userFooJoin3.exit(addr3.address, "32258064516129032258");

            let rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal(1);
            expect(await stakingVault.stakedAmount()).to.equal("0");
    
        });

        it("When user is fully liquidated and they HAVE NOT claimed their rewards before liquidation", async function () {
            // Sanity checks
            expect(await lmcv.lockedCollateral(addr4.address, d3OBytes)).to.equal(fwad("1000"));
            expect(await lmcv.lockedCollateral(addr4.address, blorpBytes)).to.equal(fwad("1000"));
            expect(await d3O.balanceOf(addr4.address)).to.equal(0);
            expect(await stakingVault.d3O(addr4.address)).to.equal(0);
            expect(await stakingVault.getOwnedD3O(addr4.address)).to.equal(frad("1000"));
            expect(await lmcv.normalizedDebt(addr4.address)).to.equal(fwad("100"));

            await fooJoin.join(fwad("100"));

            expect(await stakingVault.withdrawableRewards(addr4.address, fooBytes)).to.equal("0");

            // User 1 gets liquidated, d3O is transferred to user 2 (bypasses auction functionality)
            await lmcv.seize([d3OBytes], [fwad("1000")], fwad("100"), addr4.address, addr2.address, owner.address);

            expect(await lmcv.lockedCollateral(addr4.address, d3OBytes)).to.equal(0);
            expect(await lmcv.lockedCollateral(addr4.address, blorpBytes)).to.equal(fwad("1000"));
            expect(await d3O.balanceOf(addr4.address)).to.equal(0);
            expect(await stakingVault.d3O(addr4.address)).to.equal(0);
            expect(await stakingVault.getOwnedD3O(addr4.address)).to.equal(0);
            expect(await lmcv.normalizedDebt(addr4.address)).to.equal(0);

            //User 2 gets d3O
            expect(await lmcv.unlockedCollateral(addr2.address, d3OBytes)).to.equal(fwad("1000"));
            
            let user2d3OCollatJoin = d3OCollateralJoin.connect(addr2);
            await user2d3OCollatJoin.exit(addr2.address, fwad("1000"));

            expect(await d3O.balanceOf(addr2.address)).to.equal(fwad("1000"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
            expect(await stakingVault.getOwnedD3O(addr2.address)).to.equal(frad("1300"));

            let user2d3OJoin = d3OJoin.connect(addr2);
            await user2d3OJoin.join(addr2.address, fwad("1000"));

            expect(await d3O.balanceOf(addr2.address)).to.equal(0);
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("1300"));

            //LiquidationWithdraws 1000 LP token
            await userSV2.liquidationWithdraw(addr2.address, addr4.address, frad("1000"));

            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("1700"));

            expect(await stakingVault.totalD3O()).to.equal(frad("3100"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("3100"));


            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("24390243902439024390");

            // All users claim their rewards
            await userSV.stake(0, addr1.address);
            await userSV2.stake(0, addr2.address);
            await userSV3.stake(0, addr3.address);

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("19512195121951219513");
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("35347972248050926257"); 

            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("31707317073170731707");
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal("13255489593019097346"); 

            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("48780487804878048780");
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("88369930620127315642"); 

            let userFooJoin1 = fooJoin.connect(addr1);
            let userFooJoin2 = fooJoin.connect(addr2);
            let userFooJoin3 = fooJoin.connect(addr3);
            await userFooJoin1.exit(addr1.address, "19512195121951219513");
            await userFooJoin2.exit(addr2.address, "31707317073170731707");
            await userFooJoin3.exit(addr3.address, "48780487804878048780");

            await fooJoin.join(fwad("50"));

            //All users claim their rewards
            await userSV.stake(fwad("-800"), addr1.address);
            await userSV2.stake(fwad("-300"), addr2.address);
            await userSV3.stake(fwad("-2000"), addr3.address);

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("12903225806451612903");
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("4838709677419354839");
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("32258064516129032258");
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal("0");
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("0");
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("0");

            userFooJoin1 = fooJoin.connect(addr1);
            userFooJoin2 = fooJoin.connect(addr2);
            userFooJoin3 = fooJoin.connect(addr3);
            await userFooJoin1.exit(addr1.address, "12903225806451612903");
            await userFooJoin2.exit(addr2.address, "4838709677419354839");
            await userFooJoin3.exit(addr3.address, "32258064516129032258");

            let rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal(1);
            expect(await stakingVault.stakedAmount()).to.equal("0");
        });
    });

    
});
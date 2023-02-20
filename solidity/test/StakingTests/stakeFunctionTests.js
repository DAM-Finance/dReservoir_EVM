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
let d3OBytes = ethers.utils.formatBytes32String("d3O");

// Accounts.
let owner, addr1, addr2, addr3, addrs;

// Contracts and contract factories.
let d3OFactory, d3O;
let d3OJoinFactory, d3OJoin;
let stakingVaultFactory, stakingVault;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz;
let rewardJoinFactory, fooJoin, barJoin;
let stakeJoinFactory, stakeJoin;
let userStakeJoin, userStakeJoin2, userStakeJoin3;
let userSV, userSV2, userSV3;

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

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("Stake Testing", function () {

    before(async function () {
        d3OFactory              = await ethers.getContractFactory("d3O");
        LMCVFactory                 = await ethers.getContractFactory("LMCV");
        stakingVaultFactory         = await ethers.getContractFactory("StakingVault");
        d3OJoinFactory          = await ethers.getContractFactory("d3OJoin");
        tokenFactory                = await ethers.getContractFactory("MockTokenFour");
        rewardJoinFactory           = await ethers.getContractFactory("RewardJoin");
        stakeJoinFactory            = await ethers.getContractFactory("StakeJoin");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        d3O = await d3OFactory.deploy();
        lmcv = await LMCVFactory.deploy();
        stakingVault = await stakingVaultFactory.deploy(d3OBytes, d3O.address, lmcv.address);
        d3OJoin = await d3OJoinFactory.deploy(stakingVault.address, d3O.address);

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

    describe("Stake Function", function () {
        it("Stake function should work properly with rewards", async function () {

            //User 1 adds 1000 stakeable coin with join contract, and stake only 800 of it
            await userStakeJoin.join(addr1.address, fwad("1000"));
            await userSV.stake(fwad("800"), addr1.address);
    
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal(0);
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal(0);
            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("800"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("200"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("800"));
    
            
            //User 2 adds 1000 stakeable coin with join contract, and stake only 300 of it
            await userStakeJoin2.join(addr2.address, fwad("1000"));
            await userSV2.stake(fwad("300"), addr2.address);
    
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal(0);
            expect(await stakingVault.rewardDebt(addr2.address, barBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal(0);
            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("700"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
    
            expect(await stakingVault.totalD3O()).to.equal(frad("1100"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("1100"));
    
            // Foo Rewards get added
            await fooJoin.join(fwad("20"));
            
            let rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal(fwad("20"));
            expect(rewardTokenData['accumulatedRewardPerStaked']).to.equal("18181818181818181818181818"); // ray of 0.018
    
            //User 1 stakes 0 to claim rewards
            await userSV.stake("0", addr1.address);
    
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("14545454545454545454"); // wad 14.545
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("14545454545454545454");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal(0);
            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("800"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("200"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("800"));
    
            let userFooJoin1 = fooJoin.connect(addr1);
            await userFooJoin1.exit(addr1.address, "14545454545454545454");
            
            rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(await foo.balanceOf(addr1.address)).to.equal("14545454545454545454");
            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("0");
            expect(rewardTokenData['totalRewardAmount']).to.equal(fwad("5.454545454545454546"));
    
            //Third user stakes 2000 - has reward debt but no withdrawable rewards
            //This is how history is tracked
            await userStakeJoin3.join(addr3.address, fwad("2000"));
            await userSV3.stake(fwad("2000"), addr3.address);
    
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("36363636363636363636");
            expect(await stakingVault.rewardDebt(addr3.address, barBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal(0);
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal(0);
            expect(await stakingVault.lockedStakeable(addr3.address)).to.equal(fwad("2000"));
            expect(await stakingVault.unlockedStakeable(addr3.address)).to.equal(0);
            expect(await stakingVault.d3O(addr3.address)).to.equal(frad("2000"));
    
            expect(await stakingVault.totalD3O()).to.equal(frad("3100"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("3100"));
    
            //More foo rewards are added and bar rewards are introduced
            await fooJoin.join(fwad("5"));
            await barJoin.join(fwad("100"));
            
            rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal(fwad("10.454545454545454546"));
            expect(rewardTokenData['accumulatedRewardPerStaked']).to.equal("19794721407624633431085043"); // ray of 0.019794
    
            let rewardTokenData2 = await stakingVault.RewardData(barBytes);
            expect(rewardTokenData2['totalRewardAmount']).to.equal(fwad("100"));
            expect(rewardTokenData2['accumulatedRewardPerStaked']).to.equal("32258064516129032258064516"); // ray of 0.0322
    
            // All users call stake again to get their rewards
            // User 1
            await userSV.stake("0", addr1.address);
    
            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("15835777126099706744"); // wad 15.8
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal("25806451612903225806"); // wad 25.8
            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("1290322580645161290"); // wad 15.8-14.45 ~= 1.29
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("25806451612903225806");
            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("800"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("200"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("800"));
    
            //User 2
            await userSV2.stake("0", addr2.address);
    
            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal("5938416422287390029"); // wad 5.9
            expect(await stakingVault.rewardDebt(addr2.address, barBytes)).to.equal("9677419354838709677"); // wad 9.67
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("5938416422287390029");
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal("9677419354838709677");
            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("700"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(frad("300"));
    
            //User 3
            await userSV3.stake("0", addr3.address);
    
            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("39589442815249266862"); // wad 39.59
            expect(await stakingVault.rewardDebt(addr3.address, barBytes)).to.equal("64516129032258064516"); // wad 64.5
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("3225806451612903226"); // wad 39.6-36.4 ~= 3.2
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("64516129032258064516");
            expect(await stakingVault.lockedStakeable(addr3.address)).to.equal(fwad("2000"));
            expect(await stakingVault.unlockedStakeable(addr3.address)).to.equal(0);
            expect(await stakingVault.d3O(addr3.address)).to.equal(frad("2000"));
    
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
    
            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("0");
    
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal("0");
    
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("0");
    
            rewardTokenData = await stakingVault.RewardData(fooBytes);
            rewardTokenData2 = await stakingVault.RewardData(barBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal("1"); // Not wad 1, just 1 from integer cutoff, less than billionths of a cent
            expect(rewardTokenData2['totalRewardAmount']).to.equal("1");
    
            expect(await foo.balanceOf(fooJoin.address)).to.equal("1");
            expect(await bar.balanceOf(barJoin.address)).to.equal("1");
        });
    });

    describe("Unstake Function", function () {
        beforeEach(async function () {
            // --- SAME SETUP AS BASIC STAKE TEST ABOVE WITHOUT END WITHDRAWS --- 
            await userStakeJoin.join(addr1.address, fwad("1000"));
            await userSV.stake(fwad("800"), addr1.address);
    
            await userStakeJoin2.join(addr2.address, fwad("1000"));
            await userSV2.stake(fwad("300"), addr2.address);

            await fooJoin.join(fwad("20"));

            await userSV.stake("0", addr1.address);
    
            let userFooJoin1 = fooJoin.connect(addr1);
            await userFooJoin1.exit(addr1.address, "14545454545454545454");
    
            await userStakeJoin3.join(addr3.address, fwad("2000"));
            await userSV3.stake(fwad("2000"), addr3.address);

            await fooJoin.join(fwad("5"));
            await barJoin.join(fwad("100"));
        });

        it("Basic Unstake function should work properly properly when all rewards taken out", async function () {
            await userSV.stake(fwad("-800"), addr1.address);

            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(0);
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("1000"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(0);

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("1290322580645161290");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("25806451612903225806");

            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal(0); // wad 15.8
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal(0); // wad 25.8
            
    
            expect(await stakingVault.totalD3O()).to.equal(frad("2300"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2300"));
    

            await userSV2.stake(fwad("-300"), addr2.address);

            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(0);
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("1000"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(0);

            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("5938416422287390029");
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal("9677419354838709677");

            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal(0); // wad 15.8
            expect(await stakingVault.rewardDebt(addr2.address, barBytes)).to.equal(0); // wad 25.8
            
    
            expect(await stakingVault.totalD3O()).to.equal(frad("2000"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2000"));


            await userSV3.stake(fwad("-2000"), addr3.address);

            expect(await stakingVault.lockedStakeable(addr3.address)).to.equal(0);
            expect(await stakingVault.unlockedStakeable(addr3.address)).to.equal(fwad("2000"));
            expect(await stakingVault.d3O(addr3.address)).to.equal(0);

            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("3225806451612903226");
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("64516129032258064516");

            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal(0); // wad 15.8
            expect(await stakingVault.rewardDebt(addr3.address, barBytes)).to.equal(0); // wad 25.8
        
            expect(await stakingVault.totalD3O()).to.equal(0);
            expect(await stakingVault.stakedAmount()).to.equal(0);


        });

        it("Basic Unstake function should work properly properly when some rewards taken out", async function () {
            await userSV.stake(fwad("-500"), addr1.address);

            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("700"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("300"));

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("1290322580645161290");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("25806451612903225806");

            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("5938416422287390029"); // wad 5.9
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal("9677419354838709677"); // wad 9.7
            
    
            expect(await stakingVault.totalD3O()).to.equal(frad("2600"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2600"));
    

            await userSV2.stake(fwad("-300"), addr2.address);

            expect(await stakingVault.lockedStakeable(addr2.address)).to.equal(0);
            expect(await stakingVault.unlockedStakeable(addr2.address)).to.equal(fwad("1000"));
            expect(await stakingVault.d3O(addr2.address)).to.equal(0);

            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("5938416422287390029");
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal("9677419354838709677");

            expect(await stakingVault.rewardDebt(addr2.address, fooBytes)).to.equal(0);
            expect(await stakingVault.rewardDebt(addr2.address, barBytes)).to.equal(0); 
            
    
            expect(await stakingVault.totalD3O()).to.equal(frad("2300"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2300"));


            await userSV3.stake(fwad("-2000"), addr3.address);

            expect(await stakingVault.lockedStakeable(addr3.address)).to.equal(0);
            expect(await stakingVault.unlockedStakeable(addr3.address)).to.equal(fwad("2000"));
            expect(await stakingVault.d3O(addr3.address)).to.equal(0);

            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("3225806451612903226");
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("64516129032258064516");

            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal(0); // wad 15.8
            expect(await stakingVault.rewardDebt(addr3.address, barBytes)).to.equal(0); // wad 25.8
        
            expect(await stakingVault.totalD3O()).to.equal(frad("300"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("300"));


        });

        it("Basic Unstake function should work properly properly when some rewards taken out", async function () {
            await userSV.stake(fwad("-500"), addr1.address);
            await userSV2.stake("0", addr2.address);
            await userSV3.stake("0", addr3.address);

            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("700"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("300"));

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("1290322580645161290");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("25806451612903225806");

            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("5938416422287390029"); // wad 5.9
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal("9677419354838709677"); // wad 9.7
            
            expect(await stakingVault.totalD3O()).to.equal(frad("2600"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2600"));

            let userFooJoin1 = fooJoin.connect(addr1);
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

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal("0");
    
            expect(await stakingVault.withdrawableRewards(addr2.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr2.address, barBytes)).to.equal("0");
    
            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("0");
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("0");

            await fooJoin.join(fwad("20"));

            await userSV.stake("0", addr1.address);

            expect(await stakingVault.totalD3O()).to.equal(frad("2600"));
            expect(await stakingVault.stakedAmount()).to.equal(fwad("2600"));

            expect(await stakingVault.lockedStakeable(addr1.address)).to.equal(fwad("300"));
            expect(await stakingVault.unlockedStakeable(addr1.address)).to.equal(fwad("700"));
            expect(await stakingVault.d3O(addr1.address)).to.equal(frad("300"));

            expect(await stakingVault.withdrawableRewards(addr1.address, fooBytes)).to.equal("2307692307692307692");
            expect(await stakingVault.withdrawableRewards(addr1.address, barBytes)).to.equal(0);

            expect(await stakingVault.rewardDebt(addr1.address, fooBytes)).to.equal("8246108729979697721"); // wad 8.2
            expect(await stakingVault.rewardDebt(addr1.address, barBytes)).to.equal("9677419354838709677"); // wad 9.7

            await userSV3.stake("0", addr3.address);

            expect(await stakingVault.lockedStakeable(addr3.address)).to.equal(fwad("2000"));
            expect(await stakingVault.unlockedStakeable(addr3.address)).to.equal(0);
            expect(await stakingVault.d3O(addr3.address)).to.equal(frad("2000"));

            expect(await stakingVault.withdrawableRewards(addr3.address, fooBytes)).to.equal("15384615384615384615");
            expect(await stakingVault.withdrawableRewards(addr3.address, barBytes)).to.equal("0");

            expect(await stakingVault.rewardDebt(addr3.address, fooBytes)).to.equal("54974058199864651477"); // wad 54.97
            expect(await stakingVault.rewardDebt(addr3.address, barBytes)).to.equal("64516129032258064516");
        });
    });

    describe("Require Statements", function () {
        beforeEach(async function () {
            // --- SAME SETUP AS BASIC STAKE TEST ABOVE WITHOUT END WITHDRAWS --- 
            await userStakeJoin.join(addr1.address, fwad("1000"));
            await userSV.stake(fwad("800"), addr1.address);
    
            await userStakeJoin2.join(addr2.address, fwad("1000"));
            await userSV2.stake(fwad("300"), addr2.address);

            await fooJoin.join(fwad("20"));

            await userSV.stake("0", addr1.address);
    
            let userFooJoin1 = fooJoin.connect(addr1);
            await userFooJoin1.exit(addr1.address, "14545454545454545454");
    
            await userStakeJoin3.join(addr3.address, fwad("2000"));
            await userSV3.stake(fwad("2000"), addr3.address);

            await fooJoin.join(fwad("5"));
            await barJoin.join(fwad("100"));
        });

        it("More staked than allowed fails", async function () {
            //Admin sets limit
            await stakingVault.setStakedAmountLimit(fwad("5000"));

            //User tries to go above limit
            await userStakeJoin.join(addr1.address, fwad("10000"));

            await expect(userSV.stake(fwad("10000"), addr1.address)).to.be.revertedWith("StakingVault/Cannot be over staked token limit");
        });
    });

    describe("RewardJoin Push Function", function () {
        it("Rewards added by admin works properly", async function () {
            //Needs stake amount to put rewards in, otherwise reward per share is infinite
            await userStakeJoin.join(addr1.address, fwad("1000"));
            await userSV.stake(fwad("1000"), addr1.address);
    
            //admin puts rewards in
            await fooJoin.join(fwad("100"));
    
            let rewardTokenData = await stakingVault.RewardData(fooBytes);
            expect(rewardTokenData['totalRewardAmount']).to.equal(fwad("100"));
            expect(rewardTokenData['accumulatedRewardPerStaked']).to.equal(fray("0.1"));
        });
    
        it("More added than user has fails", async function () {
            await expect(fooJoin.join(fwad("2001"))).to.be.revertedWith("token-insufficient-balance")
        });
    });
});
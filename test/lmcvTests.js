const {expect} = require("chai");
const {ethers} = require("hardhat");

function formatWad(wad){
    return ethers.utils.parseEther(wad);
}

function formatRay(ray){
    let val = ethers.utils.parseEther(ray).mul("1000000000");
    // console.log(val);
    return val;
}

describe("Testing Setup for functions", function () {

    let owner, addr1, addr2, addrs;
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

    before(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        LMCVFactory = await ethers.getContractFactory("LMCV");
        lmcv = await LMCVFactory.deploy();

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, owner.address, formatRay("0.01"));

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, mockToken2Bytes, tokenTwo.address);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, mockToken3Bytes, tokenThree.address);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        let mockTokenAddr1 = mockToken.connect(addr1);
        let mockToken2Addr1 = tokenTwo.connect(addr1);
        let mockToken3Addr1 = tokenThree.connect(addr1);
        
        await mockTokenAddr1.approve(collateralJoin.address);
        await mockToken2Addr1.approve(collatJoinTwo.address);
        await mockToken3Addr1.approve(collatJoinThree.address);

        await mockTokenAddr1.mint(formatWad("1000"));
        await mockToken2Addr1.mint(formatWad("1000"));
        await mockToken3Addr1.mint(formatWad("1000"));

        let collatJoinAddr1 = collateralJoin.connect(addr1);
        await collatJoinAddr1.join(addr1.address, formatWad("555"));

        let collatJoin2Addr1 = collatJoinTwo.connect(addr1);
        await collatJoin2Addr1.join(addr1.address, formatWad("666"));

        let collatJoin3Addr1 = collatJoinThree.connect(addr1);
        await collatJoin3Addr1.join(addr1.address, formatWad("777"));

    });

    it("Should run before properly", async function () {
        let amount = await lmcv.unlockedCollateral(addr1.address, mockTokenBytes);
        expect(amount.toString()).to.equal("555000000000000000000");
        let amount2 = await lmcv.unlockedCollateral(addr1.address, mockToken2Bytes);
        expect(amount2.toString()).to.equal("666000000000000000000");
        let amount3 = await lmcv.unlockedCollateral(addr1.address, mockToken3Bytes);
        expect(amount3.toString()).to.equal("777000000000000000000");
    });

    it("should set up collateral list", async function () {
        await lmcv.editCollateralList(mockTokenBytes, true, 0);
        await lmcv.editCollateralList(mockToken2Bytes, true, 0);
        await lmcv.editCollateralList(mockToken3Bytes, true, 0);

        expect(await lmcv.CollateralList(0)).to.equal(mockTokenBytes);
        expect(await lmcv.CollateralList(1)).to.equal(mockToken2Bytes);
        expect(await lmcv.CollateralList(2)).to.equal(mockToken3Bytes);
    });

    it("should not let non-auth set up collateral list", async function () {
        let addr1LMCV = await lmcv.connect(addr1);
        await expect(addr1LMCV.editCollateralList(mockTokenBytes, true, 0)).to.be.revertedWith("LMCV/Not Authorized");
    });

    it("should set up collateralType mapping", async function () {
        await lmcv.editAcceptedCollateralType(mockTokenBytes, formatWad("1000"), formatWad("1"), formatRay("0.5"), formatRay("0.08"));

        let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
        // console.log(collateralType);
        expect(collateralType['spotPrice']).to.equal(0);
        expect(collateralType['totalDebt']).to.equal(0);
        expect(collateralType['debtCeiling']).to.equal("1000000000000000000000");
        expect(collateralType['debtFloor']).to.equal("1000000000000000000");
        expect(collateralType['debtMult']).to.equal("500000000000000000000000000");
        expect(collateralType['liqBonusMult']).to.equal("80000000000000000000000000");
    });


    describe("Deployment", function () {

    });
});


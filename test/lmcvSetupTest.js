const {expect} = require("chai");
const {ethers} = require("hardhat");

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
let collateralBytesList = [mockTokenBytes, mockToken2Bytes, mockToken3Bytes];
let debtCeiling;
let lmcvProxy, lmcvProxyFactory;

//Format as wad
function fwad(wad){
    return ethers.utils.parseEther(wad);
}

//Format as ray
function fray(ray){
    let val = ethers.utils.parseEther(ray).mul("1000000000");
    // console.log(val);
    return val;
}

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address);
    await mockToken2Connect.approve(collatJoinTwo.address);
    await mockToken3Connect.approve(collatJoinThree.address);

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

describe("Testing Setup for functions", function () {

    before(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        LMCVFactory = await ethers.getContractFactory("LMCV");
        lmcv = await LMCVFactory.deploy();

        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockTokenBytes, mockToken.address, 18);

        tokenTwo = await tokenFactory.deploy("TST2");
        tokenThree = await tokenFactory.deploy("TST3");

        collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken2Bytes, tokenTwo.address, 18);
        collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, mockToken3Bytes, tokenThree.address, 18);

        await lmcv.administrate(collateralJoin.address, 1);
        await lmcv.administrate(collatJoinTwo.address, 1);
        await lmcv.administrate(collatJoinThree.address, 1);

        debtCeiling = "50000000000000000000000000000000000000000000000000";  // [rad] $50000
        await lmcv.setProtocolDebtCeiling(debtCeiling);

        await setupUser(addr1, ["555", "666", "777"]);
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
        await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"), false);
        let collateralType = await lmcv.CollateralData(mockTokenBytes);
        // console.log(collateralType);
        expect(collateralType['spotPrice']).to.equal(0);
        expect(collateralType['lockedAmount']).to.equal(0);
        expect(collateralType['lockedAmountLimit']).to.equal("1000000000000000000000");
        expect(collateralType['dustLevel']).to.equal("1000000000000000000");
        expect(collateralType['creditRatio']).to.equal("500000000000000000000000000");
        expect(collateralType['liqBonusMult']).to.equal("80000000000000000000000000");

        await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"), false);
        let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
        // console.log(collateralType);
        expect(collateralType2['spotPrice']).to.equal(0);
        expect(collateralType2['lockedAmount']).to.equal(0);
        expect(collateralType2['lockedAmountLimit']).to.equal("1000000000000000000000");
        expect(collateralType2['dustLevel']).to.equal("1000000000000000000");
        expect(collateralType2['creditRatio']).to.equal("500000000000000000000000000");
        expect(collateralType2['liqBonusMult']).to.equal("80000000000000000000000000");

        await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"), false);
        let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
        // console.log(collateralType);
        expect(collateralType3['spotPrice']).to.equal(0);
        expect(collateralType3['lockedAmount']).to.equal(0);
        expect(collateralType3['lockedAmountLimit']).to.equal("1000000000000000000000");
        expect(collateralType3['dustLevel']).to.equal("1000000000000000000");
        expect(collateralType3['creditRatio']).to.equal("500000000000000000000000000");
        expect(collateralType3['liqBonusMult']).to.equal("80000000000000000000000000");
    });

    it("should update spotPrice for collaterals and addr1 should have collateral worth $43290", async function () {
        await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
        await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
        await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

        let collateralType = await lmcv.CollateralData(mockTokenBytes);
        expect(collateralType['spotPrice']).to.equal("40000000000000000000000000000");

        let collateralType2 = await lmcv.CollateralData(mockToken2Bytes);
        expect(collateralType2['spotPrice']).to.equal("20000000000000000000000000000");

        let collateralType3 = await lmcv.CollateralData(mockToken3Bytes);
        expect(collateralType3['spotPrice']).to.equal("10000000000000000000000000000");
    });
});
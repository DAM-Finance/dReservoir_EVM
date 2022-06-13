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

describe("Connections between contracts so far", function () {

    let owner, addr1, addr2, addrs;
    let dPrimeFactory, dPrime;
    let dPrimeJoinFactory, dPrimeJoin;
    let LMCVFactory, lmcv;
    let tokenFactory, mockToken;
    let collateralJoinFactory, collateralJoin;
    let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
    let lmcvProxy, lmcvProxyFactory;

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        LMCVFactory = await ethers.getContractFactory("LMCV");
        lmcv = await LMCVFactory.deploy();
        lmcvProxyFactory = await ethers.getContractFactory("LMCVProxy");
        lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);

        dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
        dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address, owner.address, formatRay("0.03"));

        tokenFactory = await ethers.getContractFactory("MockTokenTwo");
        mockToken = await tokenFactory.deploy("TSTR");

        collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
        collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);
    });

    describe("Deployment", function () {
        it("Should set the right admins", async function () {
            expect(await dPrime.admins(owner.address)).to.equal(1);
            expect(await lmcv.admins(owner.address)).to.equal(1);
        });

        it("CollateralJoin should successfully transfer tokens when permissions are configured properly", async function () {
            //Collateral join given admin access
            await lmcv.administrate(collateralJoin.address, 1);

            let mockTokenAddr1 = await mockToken.connect(addr1);
            await mockTokenAddr1.approve(collateralJoin.address);
            await mockTokenAddr1.mint(formatWad("1000"));

            let collatJoinAddr1 = collateralJoin.connect(addr1);
            await collatJoinAddr1.join(addr1.address, formatWad("37"));



            let amount = await lmcv.unlockedCollateral(addr1.address, mockTokenBytes);
            // console.log(amount.toString());
            expect(amount.toString()).to.equal("37000000000000000000");
        });
    });
});


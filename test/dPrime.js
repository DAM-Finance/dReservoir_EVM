const { expect } = require("chai");
const {ethers} = require("hardhat");

describe("dPrime contract", function () {

    let dPrimeFactory;
    let dPrime;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    beforeEach(async function () {
        dPrimeFactory = await ethers.getContractFactory("dPrime");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        dPrime = await dPrimeFactory.deploy();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            let chainId = await dPrime.deploymentChainId();
            console.log(chainId);
            expect(await dPrime.wards(owner.address)).to.equal(1);
        });
    });
});

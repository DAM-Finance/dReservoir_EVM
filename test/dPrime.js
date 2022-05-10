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
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();
    });

    describe("Deployment", function () {
        it("Should set deployer as ward", async function () {
            let chainId = await dPrime.deploymentChainId();
            console.log(chainId);
            expect(await dPrime.admins(owner.address)).to.equal(1);
        });
    });
});

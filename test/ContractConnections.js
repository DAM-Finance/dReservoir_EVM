const { expect } = require("chai");
const {ethers} = require("hardhat");

describe("Connections between contracts so far", function () {

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
        it("Should set the right wards", async function () {

            expect(await dPrime.wards(owner.address)).to.equal(1);
        });
    });
});


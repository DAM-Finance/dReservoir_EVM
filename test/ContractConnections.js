const {expect} = require("chai");
const {ethers} = require("hardhat");

describe("Connections between contracts so far", function () {

    let owner, addr1, addr2, addrs;
    let dPrimeFactory, dPrime;
    let vatFactory, vat;
    let tokenFactory, mockToken;

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        dPrimeFactory = await ethers.getContractFactory("dPrime");
        dPrime = await dPrimeFactory.deploy();

        vatFactory = await ethers.getContractFactory("Vat");
        vat = await vatFactory.deploy();

        tokenFactory = await ethers.getContractFactory("MockToken");
        mockToken = await tokenFactory.deploy("TSTR");


    });

    describe("Deployment", function () {
        it("Should set the right wards", async function () {

            expect(await dPrime.wards(owner.address)).to.equal(1);
        });
    });
});


const { ethers } = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }

// Contracts and contract factories.
let dPrimeFactory, dPrime;
let lzEndpoint;

async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    endpointFactory         = await ethers.getContractFactory("Endpoint");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function newSetup(){

    const [deployer] = await ethers.getSigners();

    moonbaseDPRIME = await dPrimeFactory.deploy("0xb23b28012ee92E8dE39DEb57Af31722223034747");

    console.log("Deployer:                  ", deployer.address);
    console.log("Moonbase dPrime address:    ", moonbaseDPRIME.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    dPrime = await dPrimeFactory.attach("0x95D8E71E2E31fB3B99aD398745856AEAbE2cf3ac");
    lzEndpoint = await endpointFactory.attach("0xb23b28012ee92E8dE39DEb57Af31722223034747");

    console.log("Attached: ", dPrime.address, "\n");
    
    feeAmount = await dPrime.estimateSendFee(
        "10001",
        "0x57A80C11413d4014B223687E07C827e8175F20e4",
        fwad("10"),
        false,
        ethers.utils.randomBytes(0)
    );

    console.log(feeAmount.nativeFee);
}

async function mint(){
    console.log("Minting");
    await dPrime.mint("0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("999"));
}

async function setTrustedRemote(){
    console.log("Setting remote");
    let result = await dPrime.setTrustedRemote("10001", "0x75396167802c8719A85571c37240c3E16B2007c2");
    console.log(result);
}


main()
    .then(() => attach())

    // .then(() => mint())
    // .then(() => setTrustedRemote())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
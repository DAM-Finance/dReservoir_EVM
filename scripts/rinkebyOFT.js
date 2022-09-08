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

    rinkebyDPRIME = await dPrimeFactory.deploy("0x79a63d6d8BBD5c6dfc774dA79bCcD948EAcb53FA");

    console.log("Deployer:                  ", deployer.address);
    console.log("rinkeby dPrime address:    ", rinkebyDPRIME.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    dPrime = await dPrimeFactory.attach("0x4eA2CaA1eb20A211c6d926287b6b39D0E002fCf6");
    lzEndpoint = await endpointFactory.attach("0x79a63d6d8BBD5c6dfc774dA79bCcD948EAcb53FA");

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
    await dPrime.mint("0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("10000"));
}

async function setTrustedRemote(){
    let result = await dPrime.setTrustedRemote("10002", "0x00D8b21256d979ACB348c2022C8Bf9B37418D3Dc");
    console.log(result);
}

async function getSenders(){
    console.log(await dPrime.senders(0));
    console.log(await dPrime.senders(1), "\n");
    console.log(await dPrime.senders(2));
}

// async function setAuth(){
//     let result = await dPrime.rely("0xf5e8a439c599205c1ab06b535de46681aed1007a");
//     console.log(result);
//     let receipt = await result.wait();
//     console.log(receipt);
// }


main()
    .then(() => attach())
    .then(() => getSenders())
    // .then(() => setTrustedRemote())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
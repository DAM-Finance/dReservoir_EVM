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

    dPrime = await dPrimeFactory.attach("0x75396167802c8719A85571c37240c3E16B2007c2");
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
    let result = await dPrime.setTrustedRemote("10002", "0xf209894986d921b2868821E728eFa57145Fed3f7");
    console.log(result);
}

async function getSenders(){
    console.log(await dPrime.senders(0));
    console.log(await dPrime.senders(1), "\n");
    console.log(await dPrime.senders(2));
}

async function moonbaseTrustedRemote(){
    let result = await dPrime.setTrustedRemote("10026", "0x95D8E71E2E31fB3B99aD398745856AEAbE2cf3ac");
    console.log(result);
}

async function sendToMoonbase(){

    feeAmount = await dPrime.estimateSendFee(
        "10026",
        "0x57A80C11413d4014B223687E07C827e8175F20e4",
        fwad("10"),
        false,
        []
    );

    let resultNoAwait = await dPrime.sendFrom(
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address _from, 
        "10026",                                        //uint16 _dstChainId, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //bytes memory _toAddress, 
        fwad("10"),                                     //uint _amount, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address payable _refundAddress, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address _zroPaymentAddress, 
        [],                    //bytes memory _adapterParams
        {value: feeAmount.nativeFee}
    );
    console.log(resultNoAwait);
}

// async function setAuth(){
//     let result = await dPrime.rely("0xf5e8a439c599205c1ab06b535de46681aed1007a");
//     console.log(result);
//     let receipt = await result.wait();
//     console.log(receipt);
// }


main()
    .then(() => attach())
    .then(() => sendToMoonbase())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
const { ethers } = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }

// Contracts and contract factories.
let dPrimeFactory, dPrime;
let feeAmount;
let lzEndpoint;

async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    endpointFactory         = await ethers.getContractFactory("Endpoint");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function newSetup(){

    const [deployer] = await ethers.getSigners();

    bnbDPRIME = await dPrimeFactory.deploy("0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1");

    console.log("Deployer:              ", deployer.address);
    console.log("bnb dPrime address:    ", bnbDPRIME.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    dPrime = await dPrimeFactory.attach("0xf209894986d921b2868821E728eFa57145Fed3f7");
    lzEndpoint = await endpointFactory.attach("0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1");

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
    let result = await dPrime.setTrustedRemote("10001", "0x75396167802c8719A85571c37240c3E16B2007c2");
    console.log(result);
}

async function getSenders(){
    console.log(await dPrime.senders(0));
}

async function teleport(){
    let resultNoAwait = await dPrime.sendFrom(
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address _from, 
        "10001",                                        //uint16 _dstChainId, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //bytes memory _toAddress, 
        fwad("10"),                                     //uint _amount, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address payable _refundAddress, 
        "0x57A80C11413d4014B223687E07C827e8175F20e4",   //address _zroPaymentAddress, 
        ethers.utils.randomBytes(0),                    //bytes memory _adapterParams
        {value: feeAmount.nativeFee}
    );
    console.log(resultNoAwait);
}


main()
    .then(() => attach())
    // .then(() => mint())
    .then(() => teleport())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
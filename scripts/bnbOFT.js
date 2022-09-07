const { ethers } = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

// Token types.
let fooBytes = ethers.utils.formatBytes32String("FOO");
let barBytes = ethers.utils.formatBytes32String("BAR");
let bazBytes = ethers.utils.formatBytes32String("BAZ");

// Accounts.
let userOne, userTwo;

// Contracts and contract factories.
let dPrimeFactory, dPrime;

let feeAmount;

let lzEndpoint;


async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    LMCVFactory             = await ethers.getContractFactory("LMCV");
    dPrimeJoinFactory       = await ethers.getContractFactory("dPrimeJoin");
    tokenFactory            = await ethers.getContractFactory("MockTokenTwo");
    collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
    lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");

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

    dPrime = await dPrimeFactory.attach("0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    lzEndpoint = await endpointFactory.attach("0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1");

    console.log("Attached: ", dPrime.address, "\n");
    
    // feeAmount = await dPrime.estimateSendFee(
    //     "10001", 
    //     "0x57A80C11413d4014B223687E07C827e8175F20e4", 
    //     fwad("10"),
    //     false,
    //     ethers.utils.randomBytes(0)
    // );

    // console.log(feeAmount.nativeFee);
}

async function mint(){
    await dPrime.mint("0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("10000"));
}

async function setTrustedRemote(){
    let result = await dPrime.setTrustedRemote("10001", "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    console.log(result);
}

async function teleportDPRIME(){
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
    console.log(await resultNoAwait.wait);
}

async function checkStoredPayload(){
    let nonceResult = await lzEndpoint.outboundNonce("10001", "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    console.log(nonceResult);
}

async function checkTrusted(){
    let trusted = await dPrime.trustedRemoteLookup("10001");
    console.log(trusted);
}


main()
    .then(() => attach())
    .then(() => checkStoredPayload())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
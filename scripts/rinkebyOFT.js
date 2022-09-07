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

    rinkebyDPRIME = await dPrimeFactory.deploy("0x79a63d6d8BBD5c6dfc774dA79bCcD948EAcb53FA");

    console.log("Deployer:                  ", deployer.address);
    console.log("rinkeby dPrime address:    ", rinkebyDPRIME.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    dPrime = await dPrimeFactory.attach("0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    lzEndpoint = await endpointFactory.attach("0x79a63d6d8BBD5c6dfc774dA79bCcD948EAcb53FA");

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
    let result = await dPrime.setTrustedRemote("10002", "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    console.log(result);
}

async function checkStoredPayload(){
    let nonceResult = await lzEndpoint.getInboundNonce("10002", "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    console.log(nonceResult);
    let txResult = await lzEndpoint.hasStoredPayload("10002", "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0");
    console.log(txResult);
}

async function receivePayload(){
    let result = await lzEndpoint.receivePayload(
        "10002",                                            //uint16 _srcChainId, 
        "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0",       //bytes calldata _srcAddress, 
        "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0",       //address _dstAddress, 
        "2",                                                //uint64 _nonce, 
        ethers.utils.parseEther(".01"),                      //uint _gasLimit, 
        ethers.utils.defaultAbiCoder.encode(["bytes", "uint"], ["0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("10")]) //bytes calldata _payload
        );
    console.log(result);
}

async function retryPayload(){
    let result = await lzEndpoint.retryPayload(
        "10002",                                            //uint16 _srcChainId, 
        "0xFE0b8fc2247515374F4D261ae5DcAE95eb3D93d0",       //bytes calldata _srcAddress,
        ethers.utils.defaultAbiCoder.encode(["bytes", "uint"], ["0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("10")])                 //bytes calldata _payload
        );
    console.log(result);
}


main()
    .then(() => attach())
    .then(() => checkStoredPayload())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
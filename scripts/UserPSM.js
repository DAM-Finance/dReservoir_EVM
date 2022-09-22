const { ethers } = require("hardhat");

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

//BYTES
let USDCBytes = ethers.utils.formatBytes32String("PSM-USDC");


// Contracts and contract factories.
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let lmcvFactory, lmcv;
let decCollateralJoinFactory, usdcJoin;
let lmcvProxyFactory, lmcvProxy;
let psm, psmFactory;
let lzEndpoint;

async function main(){
    dPrimeFactory               = await ethers.getContractFactory("dPrime");
    endpointFactory             = await ethers.getContractFactory("Endpoint");
    lmcvFactory                 = await ethers.getContractFactory("LMCV");
    decCollateralJoinFactory    = await ethers.getContractFactory("CollateralJoinDecimals");
    dPrimeJoinFactory           = await ethers.getContractFactory("dPrimeJoin");
    lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
    psmFactory = await ethers.getContractFactory("PSM");


    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    dPrime = await dPrimeFactory.attach("0x75396167802c8719A85571c37240c3E16B2007c2");
    lmcv = await lmcvFactory.attach("0x6CD5fA2262bCD92b0644289A04B9fa6a8342CB37");
    lmcvProxy = await lmcvProxyFactory.attach("0xE26182845FCC2732771B4A7b1eCC947B5f724965");

    usdcJoin = await decCollateralJoinFactory.attach("0xf209894986d921b2868821E728eFa57145Fed3f7");
    dPrimeJoin = await dPrimeJoinFactory.attach("0xbB5F842c2EFB6CfED9dE45b49f4f34E987b52C63");
    
    psm = await psmFactory.attach("0xa2CEa9B8F6Af2d2e20B4dDB66De67cCB98EA5E3c");

    console.log("Attached dPrime: ", await dPrime.totalSupply(), "\n");
}

async function usermodePSM(){
    //Mandatory: Approve collateralJoin in usdc contract on etherscan
    //Mandatory: Approve dPrimeJoin to withdraw usdc again

    let userPSM = psm.connect(addr1);

    console.log("Trying PSM func");
    let tx = await userPSM.createDPrime(addr1.address, [USDCBytes], ["200000000"]) //2 with 6 dec
    console.log(tx);
}

async function usermodeTeleport(){
    let userDPrime = dPrime.connect(addr1);

    let fees = await userDPrime.estimateSendFee(
        "10002", 
        "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e", 
        fwad("100"),
        false,
        []
    );

    console.log(fees);

    let res = await userDPrime.sendFrom(
        "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e",   //address _from, 
        "10002",                                        //uint16 _dstChainId, 
        "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e",   //bytes memory _toAddress, 
        fwad("100"),                                     //uint _amount, 
        "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e",   //address payable _refundAddress, 
        "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e",   //address _zroPaymentAddress, 
        [],                                             //bytes memory _adapterParams
        {value: fees.nativeFee}
    );

    console.log(res);
}

main()
    .then(() => attach())
    .then(() => usermodeTeleport())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
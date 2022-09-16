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

let DEBT_CEILING = frad("5000000");

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
    lzEndpoint = await endpointFactory.attach("0x79a63d6d8BBD5c6dfc774dA79bCcD948EAcb53FA");

    lmcv = await lmcvFactory.attach("0x6CD5fA2262bCD92b0644289A04B9fa6a8342CB37");
    usdcJoin = await decCollateralJoinFactory.attach("0xf209894986d921b2868821E728eFa57145Fed3f7");

    dPrimeJoin = await dPrimeJoinFactory.attach("0xbB5F842c2EFB6CfED9dE45b49f4f34E987b52C63");
    lmcvProxy = await lmcvProxyFactory.attach("0xE26182845FCC2732771B4A7b1eCC947B5f724965");

    psm = await psmFactory.attach("0xa2CEa9B8F6Af2d2e20B4dDB66De67cCB98EA5E3c");

    console.log("Attached dPrime: ", await dPrime.totalSupply(), "\n");
}

async function setBasePerms(){

    console.log("Setting LMCVProxy admin");
    await lmcvProxy.setDPrimeJoin(dPrimeJoin.address);
    await lmcvProxy.setDPrime(dPrime.address);

    console.log("Setting dPrime admin");
    await lmcv.administrate(dPrimeJoin.address, 1);
    await dPrime.rely(dPrimeJoin.address);

    console.log("Setting USDC rely");
    await lmcv.administrate(usdcJoin.address, 1);

    console.log("Setting debt ceiling");
    await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

    console.log("Setting collateral types");
    await lmcv.editAcceptedCollateralType(USDCBytes, fwad("1000000"), fwad("1"), fray("1"), false);

    console.log("Setting spot prices");
    await lmcv.updateSpotPrice(USDCBytes, fray("1"));

}

async function setPSMPerms(){

    console.log("Setting PSM on LMCV");
    await lmcv.setPSMAddress(psm.address, true);

    console.log("Setting PSM on USDCJoin");
    await usdcJoin.rely(psm.address);
}

async function usermodePSM(){
    
}



main()
    .then(() => attach())
    .then(() => setPSMPerms())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });





// async function buildDPrimeJoin(){
//     console.log(lmcv.address);
//     console.log(dPrime.address);
//     lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
//     dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

//     //Probably dPrimeJoin - 0xbB5F842c2EFB6CfED9dE45b49f4f34E987b52C63
//     //Probably lmcvJoin - 0xE26182845FCC2732771B4A7b1eCC947B5f724965
// }



// async function buildPSM() {

//     console.log("Deploying PSM");

//     const [deployer] = await ethers.getSigners();

//     psm = await psmFactory.deploy(usdcJoin.address, dPrimeJoin.address, owner.address);
// }

// async function buildLMCV() {

//     const [deployer] = await ethers.getSigners();
    
//     lmcv = await lmcvFactory.deploy();

//     usdcJoin = await decCollateralJoinFactory.deploy(lmcv.address, ethers.constants.AddressZero, USDCBytes, "0xeb8f08a975Ab53E34D8a0330E0D34de942C95926")


//     console.log("lmcv address:          ", lmcv.address);
//     console.log("USDCJoin address:      ", usdcJoin.address);
// }
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

let tokenFactory, foo, bar, baz;
let collateralJoinFactory, fooJoin, barJoin, bazJoin;

async function main(){
    dPrimeFactory               = await ethers.getContractFactory("dPrime");
    endpointFactory             = await ethers.getContractFactory("Endpoint");
    lmcvFactory                 = await ethers.getContractFactory("LMCV");
    decCollateralJoinFactory    = await ethers.getContractFactory("CollateralJoinDecimals");
    dPrimeJoinFactory           = await ethers.getContractFactory("dPrimeJoin");
    lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
    psmFactory                  = await ethers.getContractFactory("PSM");

    tokenFactory                = await ethers.getContractFactory("MockTokenFour");
    collateralJoinFactory       = await ethers.getContractFactory("CollateralJoin");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    lmcv            = await lmcvFactory.attach("0x6CD5fA2262bCD92b0644289A04B9fa6a8342CB37");
    lmcvProxy       = await lmcvProxyFactory.attach("0xE26182845FCC2732771B4A7b1eCC947B5f724965");

    dPrime          = await dPrimeFactory.attach("0x75396167802c8719A85571c37240c3E16B2007c2");
    dPrimeJoin      = await dPrimeJoinFactory.attach("0xbB5F842c2EFB6CfED9dE45b49f4f34E987b52C63");

    usdcJoin        = await decCollateralJoinFactory.attach("0xf209894986d921b2868821E728eFa57145Fed3f7");
    psm             = await psmFactory.attach("0xa2CEa9B8F6Af2d2e20B4dDB66De67cCB98EA5E3c");

    console.log("Attached dPrime: ", await dPrime.totalSupply(), "\n");
}

async function setupCollateral(){
    
}

async function addPerms(){

    console.log("Setting collateralJoin rely");
    // await lmcv.administrate(TODO, 1); TODO

    console.log("Setting collateral types");
    // await lmcv.editAcceptedCollateralType(USDCBytes, fwad("1000000"), fwad("1"), fray("1"), false); //TODO: 

    console.log("Setting spot prices");// TODO
    // await lmcv.updateSpotPrice(USDCBytes, fray("1"));

}

main()
    .then(() => attach())
    .then(() => setPSMPerms())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
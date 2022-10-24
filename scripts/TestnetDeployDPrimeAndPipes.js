require('dotenv/config');
//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

// Token types.
let USDCBytes = ethers.utils.formatBytes32String("PSM-USDC")

// Hyperlane Addresses
const moonbaseConnectionManager = process.env['HYPERLANE_CONNECTION_MANAGER_MOONBASE'];
const moonbaseGasMaster = process.env['HYPERLANE_INTERCHAIN_ROUTER_MOONBASE'];

// Accounts.
let owner, addr1, addr2, addr3, addrs;

// Contracts and contract factories.
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let collateralJoinDecFactory, usdcJoin;
let lmcvProxyFactory, lmcvProxy;
let hyperlanePipeFactory, hyperlanePipe;
let LZPipeFactory, lzPipe;
let psmFactory, psm;

// LMCV settings.
let DEBT_CEILING = frad("500000000");
const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const NumType = Object.freeze({
    WAD: 18,
    RAY: 27,
    RAD: 45
});

async function main(){
    dPrimeFactory               = await ethers.getContractFactory("dPrime");
    LMCVFactory                 = await ethers.getContractFactory("LMCV");
    dPrimeJoinFactory           = await ethers.getContractFactory("dPrimeJoin");
    collateralJoinDecFactory    = await ethers.getContractFactory("CollateralJoinDecimals");
    lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
    hyperlanePipeFactory        = await ethers.getContractFactory("dPrimeConnectorHyperlane");
    LZPipeFactory               = await ethers.getContractFactory("dPrimeConnectorLZ");
    psmFactory                  = await ethers.getContractFactory("PSM");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    // lmcv            = await LMCVFactory.attach("");
    
    // lmcvProxy       = await lmcvProxyFactory.attach("");
    // dPrimeJoin      = await dPrimeJoinFactory.attach("");
    // usdcJoin        = await collateralJoinDecFactory.attach("");
    // psm             = await psmFactory.attach("");
    dPrime          = await dPrimeFactory.attach("0xA693E53a134457A2Dc0669a77f20F114B4aaea8E");
    lzPipe          = await LZPipeFactory.attach("0xe48dc47089bd1ED3BCB06a97741e9E9E1a619F13");
    hyperlanePipe   = await hyperlanePipeFactory.attach("0x0B80E3704FC74f5621C875274203301168Ac7702");

    console.log();
    // console.log("lmcv address:          ", lmcv.address);
    // console.log("dPrimeJoin address:    ", dPrimeJoin.address);
    // console.log("usdcJoin address:      ", usdcJoin.address);
    // console.log("PSM address:           ", psm.address);
    // console.log("LMCVProxy address:     ", lmcvProxy.address);
    
    console.log("dPrime address:        ", dPrime.address);
    console.log("lzPipe address:        ", lzPipe.address);
    console.log("hyperlanePipe address: ", hyperlanePipe.address, "\n");
    
}

async function setPerms(){

    console.log("Setting dPrime pipes admin");
    await dPrime.rely(lzPipe.address);
    await dPrime.rely(hyperlanePipe.address);

    console.log("Initialization hyperlane pipe");
    await hyperlanePipe.initialize(moonbaseConnectionManager, moonbaseGasMaster, dPrime.address);
}

async function editHyperlaneDependencies() {
    await hyperlanePipe.setAbacusConnectionManager(moonbaseConnectionManager);
    await hyperlanePipe.setInterchainGasPaymaster(moonbaseGasMaster);
}

async function setupRemoteRouters(){
    let LZPipeGoerliAddress = process.env['LZPIPE_GOERLI'];
    let HyperlanePipeGoerliAddress = process.env['HYPERLANEPIPE_GOERLI'];

    console.log("Hyperlane remote");
    let resultHL = await hyperlanePipe.enrollRemoteRouter("5", ethers.utils.hexZeroPad(HyperlanePipeGoerliAddress, 32));
    console.log(resultHL);
    
    console.log("LZ Remote")
    let resultLZ = await lzPipe.setTrustedRemote("10121", LZPipeGoerliAddress);
    console.log(resultLZ);
}

// Attach to exist contracts setup 
main()
    .then(() => attach())
    .then(() => setupRemoteRouters())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
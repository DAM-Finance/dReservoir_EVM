require('dotenv/config');
//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }
function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

// Token types.
let USDCBytes = ethers.utils.formatBytes32String("PSM-USDC")

// Hyperlane Addresses
const goerliConnectionManager = process.env['HYPERLANE_CONNECTION_MANAGER_GOERLI'];
const goerliInterchainGasMaster = process.env['HYPERLANE_INTERCHAIN_ROUTER_GOERLI'];

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

    lmcv            = await LMCVFactory.attach("0x77636533402827eFAB4feD2a559a4196687FA7E4");
    dPrime          = await dPrimeFactory.attach("0x935C486825FE0C433259Ad9D9b4Bb3D46ADbb239");
    lmcvProxy       = await lmcvProxyFactory.attach("0x4eA2CaA1eb20A211c6d926287b6b39D0E002fCf6");
    dPrimeJoin      = await dPrimeJoinFactory.attach("0xe852e10f66c089c3685826620f337a6E8aB2FCE5");
    usdcJoin        = await collateralJoinDecFactory.attach("0xDaf0C8585d57eADBAC974b4dcF6AEE5862FF3d31");
    lzPipe          = await LZPipeFactory.attach("0xDC93a8cA7486e97a1ae969266898777526221bA4")
    hyperlanePipe   = await hyperlanePipeFactory.attach("0x215e8a9b5C4397a069B9D6e4b81c1b60898a2E8d")
    psm             = await psmFactory.attach("0x8bE2b54A86ADd13b141c778Fd785653A5a381d3E");

    console.log();
    console.log("Deployer:              ", deployer.address);
    console.log("dPrime address:        ", dPrime.address);
    console.log("lmcv address:          ", lmcv.address);
    console.log("dPrimeJoin address:    ", dPrimeJoin.address);
    console.log("usdcJoin address:      ", usdcJoin.address);
    console.log("lzPipe address:        ", lzPipe.address);
    console.log("hyperlanePipe address: ", hyperlanePipe.address);
    console.log("PSM address:           ", psm.address);
    console.log("LMCVProxy address:     ", lmcvProxy.address, "\n");
}

async function setPerms(){

    console.log("Setting dPrime admin");
    await lmcv.administrate(dPrimeJoin.address, 1);
    await dPrime.rely(dPrimeJoin.address);

    console.log("Setting debt ceiling");
    await lmcv.setProtocolDebtCeiling(MAX_INT);

    console.log("Setting collateral type PSM-USDC");
    await lmcv.editAcceptedCollateralType(USDCBytes, MAX_INT, fwad("1"), fray("1"), false);

    console.log("Setting spot price PSM-USDC");
    await lmcv.updateSpotPrice(USDCBytes, fray("1"));

    console.log("Setting LMCVProxy admin");
    await lmcvProxy.setDPrimeJoin(dPrimeJoin.address);
    await lmcvProxy.setDPrime(dPrime.address);

    console.log("Setting dPrime pipes admin");
    await dPrime.rely(lzPipe.address);
    await dPrime.rely(hyperlanePipe.address);

    console.log("Setting PSM on LMCV");
    await lmcv.setPSMAddress(psm.address, true);

    console.log("Setting PSM on USDCJoin");
    await usdcJoin.rely(psm.address);

    console.log("Initialization hyperlane pipe");
    await hyperlanePipe.initialize(goerliConnectionManager, goerliInterchainGasMaster, dPrime.address);
}

async function setupRemoteRouters(){
    let LZPipeAddress = process.env['LZPIPE_MOONBASE'];
    let HyperlanePipeAddress = process.env['HYPERLANEPIPE_MOONBASE'];

    console.log("Hyperlane remote");
    let resultHL = await hyperlanePipe.enrollRemoteRouter("0x6d6f2d61", ethers.utils.hexZeroPad(HyperlanePipeAddress, 32));
    console.log(resultHL);
    
    console.log("LZ Remote")
    let resultLZ = await lzPipe.setTrustedRemote("10126", LZPipeAddress);
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
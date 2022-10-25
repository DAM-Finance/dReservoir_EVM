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

    lmcv            = await LMCVFactory.attach("0x12fA0d79BCD21114D5F34A2789D9b2B5b1d7b42D");
    dPrime          = await dPrimeFactory.attach("0x0c14d2bc2562b6aB953f21B24ddE8ad9e8cba2e1");
    lmcvProxy       = await lmcvProxyFactory.attach("0x0CAfb9c3b7Aa97505276908A928bc9eA0c228324");
    dPrimeJoin      = await dPrimeJoinFactory.attach("0x3685328d43EC3F5F3efD3c61E05cDdD037aab949");
    usdcJoin        = await collateralJoinDecFactory.attach("0x7517b7900D845F18189e7e89707525E759a2eBb3");
    lzPipe          = await LZPipeFactory.attach("0x82a6A0E313765510e63fBcc0114af5C8054bDA9F");
    hyperlanePipe   = await hyperlanePipeFactory.attach("0x74487683a4E248b21A09DAA3d78B2e26cedBe5E8");
    psm             = await psmFactory.attach("0xD264Daa2b0Ae259b7864e6532A30ebe6Ac93b3fd");

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



async function testingPSM(){
    let res = await usdcJoin.wards(psm.address);
    console.log(res);

    console.log(await psm.lmcv());
    console.log(await psm.collateralJoin());
    console.log(await psm.dPrime());
    console.log(await psm.dPrimeJoin());


}

// Attach to exist contracts setup 
main()
    .then(() => attach())
    .then(() => testingPSM())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
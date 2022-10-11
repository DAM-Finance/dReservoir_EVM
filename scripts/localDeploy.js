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
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, foo, bar, baz;
let collateralJoinFactory, fooJoin, barJoin, bazJoin;
let lmcvProxyFactory, lmcvProxy;

// LMCV settings.
let DEBT_CEILING = frad("50000");
const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


// Mint a bunch of tokens and deposit some specified amount of them in the protocol.
async function setupUser(user, amounts) {
    let fooConnect = foo.connect(user);
    let barConnect = bar.connect(user);
    let bazConnect = baz.connect(user);

    console.log("minting tokens");
    await fooConnect.mint(fwad("1000"));
    await barConnect.mint(fwad("1000"));
    await bazConnect.mint(fwad("1000"));

    console.log("approving joins");
    await fooConnect.approve(fooJoin.address, MAX_INT);
    await barConnect.approve(barJoin.address, MAX_INT);
    await bazConnect.approve(bazJoin.address, MAX_INT);

    console.log("Approving lmcvProxy");
    await fooConnect.approve(lmcvProxy.address, MAX_INT);
    await barConnect.approve(lmcvProxy.address, MAX_INT);
    await bazConnect.approve(lmcvProxy.address, MAX_INT);

    let fooJoinConnect = fooJoin.connect(user);
    let barJoinConnect = barJoin.connect(user);
    let bazJoinConnect = bazJoin.connect(user);

    console.log("Doing regular joins");

    await fooJoinConnect.join(user.address, fwad(amounts.at(0)));
    await barJoinConnect.join(user.address, fwad(amounts.at(1)));
    await bazJoinConnect.join(user.address, fwad(amounts.at(2)));
    console.log('Ending joins');
}

const NumType = Object.freeze({
    WAD: 18,
    RAY: 27,
    RAD: 45
});

async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    LMCVFactory             = await ethers.getContractFactory("LMCV");
    dPrimeJoinFactory       = await ethers.getContractFactory("dPrimeJoin");
    tokenFactory            = await ethers.getContractFactory("MockTokenFour");
    collateralJoinFactory   = await ethers.getContractFactory("CollateralJoin");
    lmcvProxyFactory        = await ethers.getContractFactory("LMCVProxy");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function newSetup(){

    const [deployer] = await ethers.getSigners();

    lmcv = await LMCVFactory.deploy();
    dPrime = await dPrimeFactory.deploy();
    lmcvProxy = await lmcvProxyFactory.deploy(lmcv.address);
    dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, lmcvProxy.address);

    foo = await tokenFactory.deploy("FOO");
    bar = await tokenFactory.deploy("BAR");
    baz = await tokenFactory.deploy("BAZ");

    fooJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, fooBytes, foo.address);
    barJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, barBytes, bar.address);
    bazJoin = await collateralJoinFactory.deploy(lmcv.address, lmcvProxy.address, bazBytes, baz.address);

    console.log();
    console.log("Deployer:              ", deployer.address);
    console.log("dPrime address:        ", dPrime.address);
    console.log("lmcv address:          ", lmcv.address);
    console.log("dPrimeJoin address:    ", dPrimeJoin.address);
    console.log("LMCVProxy address:     ", lmcvProxy.address, "\n");

    console.log("foo address:           ", foo.address);
    console.log("bar address:           ", bar.address);
    console.log("baz address:           ", baz.address);
    console.log("fooJoin address:       ", fooJoin.address);
    console.log("barJoin address:       ", barJoin.address);
    console.log("bazJoin address:       ", bazJoin.address, "\n");
}

async function setPerms(){

    console.log("Setting dPrime admin");
    await lmcv.administrate(dPrimeJoin.address, 1);
    await dPrime.rely(dPrimeJoin.address);

    console.log("Setting collat join perms");
    await lmcv.administrate(fooJoin.address, 1);
    await lmcv.administrate(barJoin.address, 1);
    await lmcv.administrate(bazJoin.address, 1);

    console.log("Setting debt ceiling");
    await lmcv.setProtocolDebtCeiling(DEBT_CEILING);

    console.log("Setting collateral types");
    await lmcv.editAcceptedCollateralType(fooBytes, fwad("100000"), fwad("1"), fray("0.5"), false);
    await lmcv.editAcceptedCollateralType(barBytes, fwad("100000"), fwad("1"), fray("0.5"), false);
    await lmcv.editAcceptedCollateralType(bazBytes, fwad("100000"), fwad("1"), fray("0.5"), false);

    console.log("Setting spot prices");
    await lmcv.updateSpotPrice(fooBytes, fray("40"));
    await lmcv.updateSpotPrice(barBytes, fray("20"));
    await lmcv.updateSpotPrice(bazBytes, fray("10"));
}

async function setUser(){
    console.log("Setting up user");
    await setupUser(addr1, ["555", "666", "777"]);
}

async function loan(){
    console.log("Loan");
    let userLMCV = lmcv.connect(addr1);
    await userLMCV.approveMultiple([dPrimeJoin.address, lmcvProxy.address]);
    await userLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);

    console.log("dPrimeExit")
    let userDPrimeJoin = dPrimeJoin.connect(addr1);
    await userDPrimeJoin.exit(addr1.address, fwad("2000"));
}

async function setupCollateralLMCVProxy(){
    console.log("Setting up editCollateral for LMCVProxy");
    await lmcvProxy.editCollateral(fooBytes, fooJoin.address, foo.address, MAX_INT);
    await lmcvProxy.editCollateral(barBytes, barJoin.address, bar.address, MAX_INT);
    await lmcvProxy.editCollateral(bazBytes, bazJoin.address, baz.address, MAX_INT);

    await lmcvProxy.setDPrimeJoin(dPrimeJoin.address);
    await lmcvProxy.setDPrime(dPrime.address);
}

async function test(){

   
    console.log("Setting up test function");

    let userLMCVProxy = lmcvProxy.connect(addr1);
    await userLMCVProxy.createLoan([fooBytes], [fwad("5")], fwad("10"));

    console.log(await foo.allowance(addr1.address, lmcvProxy.address));
    console.log(await foo.allowance(lmcvProxy.address, fooJoin.address));
}

// New setup
main()
    .then(() => newSetup())
    .then(() => setPerms())
    .then(() => setUser())
    .then(() => loan())
    .then(() => setupCollateralLMCVProxy())
    .then(() => test())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
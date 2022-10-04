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

// Mint a bunch of tokens and deposit some specified amount of them in the protocol.
async function setupUser(user, amounts) {
    let fooConnect = foo.connect(user);
    let barConnect = bar.connect(user);
    let bazConnect = baz.connect(user);

    await fooConnect.mint(fwad("1000"));
    await barConnect.mint(fwad("1000"));
    await bazConnect.mint(fwad("1000"));

    await fooConnect.approve(fooJoin.address);
    await barConnect.approve(barJoin.address);
    await bazConnect.approve(bazJoin.address);

    let fooJoinConnect = fooJoin.connect(user);
    let barJoinConnect = barJoin.connect(user);
    let bazJoinConnect = bazJoin.connect(user);

    await fooJoinConnect.join(user.address, fwad(amounts.at(0)));
    await barJoinConnect.join(user.address, fwad(amounts.at(1)));
    await bazJoinConnect.join(user.address, fwad(amounts.at(2)));
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
    tokenFactory            = await ethers.getContractFactory("MockTokenTwo");
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

async function attach(){

    const [deployer] = await ethers.getSigners();

    lmcv = await LMCVFactory.attach("0x7B1960Fb005AC409466070f52d8de4143f915a04");
    dPrime = await dPrimeFactory.attach("0xf39E86ea5e491339A240120768827e1A1A32a4e1");
    lmcvProxy = await lmcvProxyFactory.attach("0xa2CEa9B8F6Af2d2e20B4dDB66De67cCB98EA5E3c");
    dPrimeJoin = await dPrimeJoinFactory.attach("0xEf75f6E9733384395DdAC1a265977fE6B03C22A8");

    foo = await tokenFactory.attach("0xDaf0C8585d57eADBAC974b4dcF6AEE5862FF3d31")
    bar = await tokenFactory.attach("0x8bE2b54A86ADd13b141c778Fd785653A5a381d3E")
    baz = await tokenFactory.attach("0xa28905518a893A085a41Ab24dbcb405E5C2AF05c")

    fooJoin = await collateralJoinFactory.attach("0xE2591840A843C93499B91176C3BDd627483C5165")
    barJoin = await collateralJoinFactory.attach("0x3cFEA900fd462607CCf32EBA83a780973d9C2F66")
    bazJoin = await collateralJoinFactory.attach("0xbb2EbebC17CAf0cD430965912632615aF9611273")

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
    console.log(await setupUser(addr1, ["555", "666", "777"]));
}

async function loan(){
    let userLMCV = lmcv.connect(addr1);
    await userLMCV.loan([fooBytes, barBytes, bazBytes], [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);

    let userDPrimeJoin = dPrimeJoin.connect(addr1);
    await userLMCV.approveMultiple([userDPrimeJoin.address]);
    await userDPrimeJoin.exit(addr1.address, fwad("2000"));
}

//New setup
// main()
//     .then(() => newSetup())
//     .then(() => process.exit(0))
//     .catch((error) => {
//         console.error(error);
//         process.exit(1);
//     });

//Attach to exist contracts setup 
main()
    .then(() => attach())
    .then(() => setPerms())
    .then(() => setUser())
    .then(() => loan())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
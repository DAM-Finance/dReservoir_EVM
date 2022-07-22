let owner, addr1, addr2, addr3, addrs;
let dPrimeFactory, dPrime;
let dPrimeJoinFactory, dPrimeJoin;
let LMCVFactory, lmcv;
let tokenFactory, mockToken;
let collateralJoinFactory, collateralJoin;
let mockTokenBytes = ethers.utils.formatBytes32String("MOCKTOKEN");
let mockToken2Bytes = ethers.utils.formatBytes32String("MOCKTOKENTWO");
let mockToken3Bytes = ethers.utils.formatBytes32String("MOCKTOKENTHREE");
let tokenTwo, tokenThree;
let collatJoinTwo, collatJoinThree;
let collateralBytesList = [mockTokenBytes, mockToken2Bytes, mockToken3Bytes];
let debtCeiling;
let userLMCV, userTwoLMCV, userThreeLMCV;

//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}

async function setupUser(addr, amounts){
    let mockTokenConnect = mockToken.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    let mockToken3Connect = tokenThree.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address);
    await mockToken2Connect.approve(collatJoinTwo.address);
    await mockToken3Connect.approve(collatJoinThree.address);

    await mockTokenConnect.mint(fwad("1000"));
    await mockToken2Connect.mint(fwad("1000"));
    await mockToken3Connect.mint(fwad("1000"));

    let collatJoinConnect = collateralJoin.connect(addr);
    await collatJoinConnect.join(addr.address, fwad(amounts.at(0)));

    let collatJoin2Connect = collatJoinTwo.connect(addr);
    await collatJoin2Connect.join(addr.address, fwad(amounts.at(1)));

    let collatJoin3Connect = collatJoinThree.connect(addr);
    await collatJoin3Connect.join(addr.address, fwad(amounts.at(2)));
}

async function main() {
    const [deployer] = await ethers.getSigners();

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    dPrimeFactory = await ethers.getContractFactory("dPrime");
    dPrime = await dPrimeFactory.attach('0xb155bC03bdb17990b62010d8adE5d9347151FdC6');

    LMCVFactory = await ethers.getContractFactory("LMCV");
    lmcv = await LMCVFactory.attach('0x4e7Ff8F3Dadd7cC40cA019c987ab252d80da7E34');

    dPrimeJoinFactory = await ethers.getContractFactory("dPrimeJoin");
    // dPrimeJoin = await dPrimeJoinFactory.deploy(lmcv.address, dPrime.address, owner.address, fray("0.015"));
    dPrimeJoin = await dPrimeJoinFactory.attach("0x2deF13E0DBF40190660c8682A6E03f19F481F5A2");

    tokenFactory = await ethers.getContractFactory("MockTokenTwo");
    mockToken = await tokenFactory.attach("0x5921eC92D08B67e92FbdA21Cd0Ea062859e9078d");

    collateralJoinFactory = await ethers.getContractFactory("CollateralJoin");
    // collateralJoin = await collateralJoinFactory.deploy(lmcv.address, mockTokenBytes, mockToken.address);
    collateralJoin = await collateralJoinFactory.attach("0x2be88c9324B67Cb2e84B4d78740FD7DbAEB9755E");

    // tokenTwo = await tokenFactory.deploy("TST2");
    // tokenThree = await tokenFactory.deploy("TST3");
    tokenTwo = await tokenFactory.attach("0x9ae66Dea03E6B1b72A2243fFd16C6D28f2b918e6");
    tokenThree = await tokenFactory.attach("0x50809ee7e9aEec55362D9cBF237a6680ac55b87b");

    // collatJoinTwo = await collateralJoinFactory.deploy(lmcv.address, mockToken2Bytes, tokenTwo.address);
    // collatJoinThree = await collateralJoinFactory.deploy(lmcv.address, mockToken3Bytes, tokenThree.address);

    collatJoinTwo = await collateralJoinFactory.attach("0xc9371c63f3acF9663fFA0bc28B9f22E65D40DD6D");
    collatJoinThree = await collateralJoinFactory.attach("0xb4179f4e9f24BC6e2162C314b49251950fbaE00E");


    //DONE -----
    // await lmcv.administrate(collateralJoin.address, 1);
    // await lmcv.administrate(collatJoinTwo.address, 1);
    // await lmcv.administrate(collatJoinThree.address, 1);

    // debtCeiling = frad("50000");
    // await lmcv.setProtocolDebtCeiling(debtCeiling);

    // await lmcv.setPartialLiqMax(fray(".50"));
    // await lmcv.setProtocolLiqFeeMult(fray(".015"));
    // await lmcv.setLiquidationMult(fray(".60"));
    // await lmcv.setLiquidationFloor(frad("10"));
    // await lmcv.setWholeCDPLiqMult(fray(".80"));

    //  await lmcv.editAcceptedCollateralType(mockTokenBytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
    // await lmcv.editAcceptedCollateralType(mockToken2Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));
    // await lmcv.editAcceptedCollateralType(mockToken3Bytes, fwad("1000"), fwad("1"), fray("0.5"), fray("0.08"));

    // await lmcv.updateSpotPrice(mockTokenBytes, fray("40"));
    // await lmcv.updateSpotPrice(mockToken2Bytes, fray("20"));
    // await lmcv.updateSpotPrice(mockToken3Bytes, fray("10"));

    // await setupUser(addr1, ["555", "666", "777"]);

    // -------


    userLMCV = lmcv.connect(addr1);

    // await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("2000"), addr1.address);

    // await lmcv.administrate(dPrimeJoin.address, 1);
    // await dPrime.rely(dPrimeJoin.address);

    let userDPrimeJoin = dPrimeJoin.connect(addr1);
    await userLMCV.proxyApprove([userDPrimeJoin.address]);
    await userDPrimeJoin.exit(addr1.address, fwad("2000"));
   

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("dPrime address:", dPrime.address);
    console.log("lmcv address:", lmcv.address);
    console.log("dPrimeJoin address:", dPrimeJoin.address);
    console.log("mockToken address:", mockToken.address);
    console.log("collateralJoin address:", collateralJoin.address);
    console.log("tokenTwo address:", tokenTwo.address);
    console.log("tokenThree address:", tokenThree.address);
    console.log("collatJoinTwo address:", collatJoinTwo.address);
    console.log("collatJoinThree address:", collatJoinThree.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

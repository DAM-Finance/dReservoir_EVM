const { ethers } = require('hardhat');

 require('dotenv/config');
 //Format as wad, ray, rad
 function fwad(wad) { return ethers.utils.parseEther(wad) }
 function fray(ray) { return ethers.utils.parseEther(ray).mul("1000000000") }
 function frad(rad) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

 // Token types.
 let USDCBytes = ethers.utils.formatBytes32String("PSM-USDC")
 let WumboBytes = ethers.utils.formatBytes32String("WMBO")
 let DonkBytes = ethers.utils.formatBytes32String("DONK")

 // Hyperlane Addresses
 const goerliConnectionManager = process.env['HYPERLANE_CONNECTION_MANAGER_GOERLI'];
 const goerliInterchainGasMaster = process.env['HYPERLANE_INTERCHAIN_ROUTER_GOERLI'];

 // Accounts.
 let owner, addr1, addr2, addr3, addrs;

 // Contracts and contract factories.
 let d2OFactory, d2O;
 let d2oJoinFactory, d2OJoin;
 let LMCVFactory, lmcv;
 let collateralJoinDecFactory, usdcJoin;
 let lmcvProxyFactory, lmcvProxy;
 let hyperlanePipeFactory, hyperlanePipe;
 let LZPipeFactory, lzPipe;
 let psmFactory, psm;

 let collatFactory, collat1, collat2;
 let collateralJoinFactory, collatJoin1, collatJoin2;

 let ratesUpdaterFactory, ratesUpdater;


 // LMCV settings.
 let DEBT_CEILING = frad("500000000");
 const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

 const NumType = Object.freeze({
     WAD: 18,
     RAY: 27,
     RAD: 45
 });

 async function main(){
     d2OFactory                  = await ethers.getContractFactory("d2O");
     LMCVFactory                 = await ethers.getContractFactory("LMCV");
     d2oJoinFactory              = await ethers.getContractFactory("d2OJoin");
     collateralJoinDecFactory    = await ethers.getContractFactory("CollateralJoinDecimals");
     lmcvProxyFactory            = await ethers.getContractFactory("LMCVProxy");
     hyperlanePipeFactory        = await ethers.getContractFactory("HyperlanePipe");
     LZPipeFactory               = await ethers.getContractFactory("LayerZeroPipe");
     psmFactory                  = await ethers.getContractFactory("PSM");
     collatFactory               = await ethers.getContractFactory("MockTokenFour");
     collateralJoinFactory       = await ethers.getContractFactory("CollateralJoin");
     ratesUpdaterFactory         = await ethers.getContractFactory("RatesUpdater");

     [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
 }

 async function attach(){

     const [deployer] = await ethers.getSigners();

     lmcv            = await LMCVFactory.attach(process.env['LMCV_GOERLI']);
     d2O             = await d2OFactory.attach(process.env['D2O_GOERLI']);
     lmcvProxy       = await lmcvProxyFactory.attach(process.env['LMCVPROXY_GOERLI']);
     d2OJoin         = await d2oJoinFactory.attach(process.env['D2OJOIN_GOERLI']);
     usdcJoin        = await collateralJoinDecFactory.attach(process.env['TEST_USDCJOIN_GOERLI']);
     lzPipe          = await LZPipeFactory.attach(process.env['LZPIPE_GOERLI']);
     hyperlanePipe   = await hyperlanePipeFactory.attach(process.env['HYPERLANEPIPE_GOERLI']);
     psm             = await psmFactory.attach(process.env['PSM_USDC_GOERLI']);
     collat1         = await collatFactory.attach(process.env['WMBO_GOERLI']);
     collat2         = await collatFactory.attach(process.env['DONK_GOERLI']);
     // collatJoin1     = await collateralJoinFactory.attach(process.env['WUMBOJOIN_GOERLI'])
     collatJoin2     = await collateralJoinFactory.attach(process.env['DONKJOIN_GOERLI'])
     ratesUpdater    = await ratesUpdaterFactory.attach(process.env['RATES_UPDATER_GOERLI'])


     console.log();
     console.log("Deployer:              ", deployer.address);
     console.log("d2O address:           ", d2O.address);
     console.log("lmcv address:          ", lmcv.address);
     console.log("d2OJoin address:       ", d2OJoin.address);
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
     console.log(await psm.d2O());
     console.log(await psm.d2OJoin());


 }

 async function deployTokens(){

     console.log("First token");
     let res = await collatFactory.deploy("WMBO");
     console.log(res);



     console.log("Second token");
     let res2 = await collatFactory.deploy("DONK")
     console.log(res2);
 }

 async function deployJoins(){

     // 0x5d9B8E21c0efD7C0C93c579128023ca810eeC73B
     // 0xAa4bD76455C5bbb93c8a2c3aa632409758A534d7

     console.log("First join");
     let res = await collateralJoinFactory.deploy(process.env['LMCV_GOERLI'], process.env['LMCVPROXY_GOERLI'], ethers.utils.formatBytes32String("WMBO"), process.env['WMBO_GOERLI']);
     console.log(res);



     // console.log("Second join");
     // let res2 = await collateralJoinFactory.deploy(process.env['LMCV_GOERLI'], process.env['LMCVPROXY_GOERLI'], ethers.utils.formatBytes32String("DONK"), process.env['DONK_GOERLI']);
     // console.log(res2);
 }

 async function deployRatesUpdater(){
     console.log("deploying rates");
     let res = await ratesUpdaterFactory.deploy(process.env['LMCV_GOERLI']);
     console.log(res);
 }

 async function changeRate(){
     console.log("deploying change in rate");
     let res = await ratesUpdater.changeStabilityRate(fray("1.0000000057774228"));
     console.log(res);
 }

 async function giveTokens(){
     let res = await collat1.mint(fwad("10000"));
     console.log(res);
     // console.log(await lmcv.CollateralData(ethers.utils.formatBytes32String("WMBO")));
 }

 async function pushLatestRate(){
     console.log("keeper rate updating");
     let res = await ratesUpdater.accrueInterest({gasLimit: 60000});
     console.log(await res.wait());
 }

 async function checkRate(){
     console.log(await lmcv.AccumulatedRate());
     console.log(await lmcv.CollateralData(ethers.utils.formatBytes32String("WMBO")));
 }

 async function addCollateral(){
     // let res  = await collat1.approve(process.env['WUMBOJOIN_GOERLI'], MAX_INT);
     // console.log(await res.wait());

     let res2 = await collatJoin1.join(owner.address, fwad("295"));
     console.log(await res2.wait());
 }

 async function createLoan(){
     // let res  = await lmcv.loan([WumboBytes], [fwad("291")], fwad("3"), owner.address);
     // console.log(await res.wait());

     console.log(await lmcv.unlockedCollateral(owner.address, ethers.utils.formatBytes32String("WMBO")));
     // console.log(await lmcv.admins("0x4daeb014BC54e2C8f87b6D17998d358011408dFb"));
 }



 // Attach to exist contracts setup 
 main()
     .then(() => attach())
     .then(() => deployJoins())
     // .then(() => checkRate())
     .then(() => process.exit(0))
     .catch((error) => {
         console.error(error);
         process.exit(1);
     });
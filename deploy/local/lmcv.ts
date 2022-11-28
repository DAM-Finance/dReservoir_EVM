import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

// TODO: Import via environment variable.
let usdcBytes = ethers.utils.formatBytes32String("PSM-USDC");	

const chainIdOne = 1;
const chainIdTwo = 2;

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad) 
}

function fray(ray: string) { 
	return ethers.utils.parseEther(ray).mul("1000000000") 
}

function frad(rad: string) { 
	return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") 
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;
	const {execute} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	// ----------
	// Collateral
	// ----------

	let usdcName 	= ethers.utils.formatBytes32String("USD Coin");
	let usdcSymbol 	= ethers.utils.formatBytes32String("USDC");

	const usdc 	= await deploy('USDC', {
		from: deployer,
		args: [usdcName, usdcSymbol],
		log: true,
		autoMine: true,
		contract: "TestERC20"
	});

	const usdcAddress = usdc.receipt?.contractAddress;

	// ----------
	// Layer Zero
	// ----------

	// LayerZero Testing Endpoint.
	// Note: This only gets deployed for local testing.

	const LZEndpointMockOne = await deploy('LZEndPointMockOne', {
		from: deployer,
		args: [chainIdOne],
		log: true,
		autoMine: true,
		contract: "LZEndpointMock"
	});

	const LZEndpointMockOneAddress = LZEndpointMockOne.receipt?.contractAddress;

	const LZEndpointMockTwo = await deploy('LZEndPointMockTwo', {
		from: deployer,
		args: [chainIdTwo],
		log: true,
		autoMine: true,
		contract: "LZEndpointMock"
	});

	const LZEndpointMockTwoAddress = LZEndpointMockTwo.receipt?.contractAddress;

	// ----
	// LMCV
	// ----

	// LMCV

	const lmcv = await deploy('LMCV', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});
	
	const lmcvAddress = lmcv.receipt?.contractAddress;

	// LMCV Proxy

	const lmcvProxy = await deploy('LMCVProxy', {
		from: deployer,
		args: [lmcvAddress],
		log: true,
		autoMine: true
	});

	const lmcvProxyAddress = lmcvProxy.receipt?.contractAddress;

	// d2O

	const d2O_One = await deploy('d2O_One', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true,
		contract: "d2O"
	});

	const d2O_OneAddress = d2O_One.receipt?.contractAddress;

	const d2O_Two = await deploy('d2O_Two', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true,
		contract: "d2O"
	});

	const d2O_TwoAddress = d2O_Two.receipt?.contractAddress;

	const d2OGuardian_One = await deploy('d2OGuardian_One', {
		from: deployer,
		args: [d2O_OneAddress],
		log: true,
		autoMine: true,
		contract: "d2OGuardian"
	});

	const d2OGuardian_OneAddress = d2OGuardian_One.receipt?.contractAddress;

	const d2OGuardian_Two = await deploy('d2OGuardian_Two', {
		from: deployer,
		args: [d2O_TwoAddress],
		log: true,
		autoMine: true,
		contract: "d2OGuardian"
	});

	const d2OGuardian_TwoAddress = d2OGuardian_Two.receipt?.contractAddress;

	// d2Oconnector layer-zero

	const LZPipeOne = await deploy('LZPipeOne', {
		from: deployer,
		args: [LZEndpointMockOneAddress, d2O_OneAddress],
		log: true,
		autoMine: true,
		contract: "LayerZeroPipe"
	});

	const LZPipeOneAddress = LZPipeOne.receipt?.contractAddress;

	const LZPipeTwo = await deploy('LZPipeTwo', {
		from: deployer,
		args: [LZEndpointMockTwoAddress, d2O_TwoAddress],
		log: true,
		autoMine: true,
		contract: "LayerZeroPipe"
	});

	const LZPipeTwoAddress = LZPipeTwo.receipt?.contractAddress;

	// D2O Join. Can only mint and burn on one network.

	const d2OJoin = await deploy('d2OJoin', {
		from: deployer,
		args: [lmcvAddress, d2O_OneAddress, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const d2OJoinAddress = d2OJoin.receipt?.contractAddress;

	// USDC Join

	const usdcJoin = await deploy('UsdcJoin', {		
		from: deployer,
		args: [lmcvAddress, lmcvProxyAddress, usdcBytes, usdcAddress],
		log: true,
		autoMine: true,
		contract: 'CollateralJoinDecimals'
	});

	const usdcJoinAddress = usdcJoin.receipt?.contractAddress;


	// USDC PSM

	const usdcPsm = await deploy('PSM', {		
		from: deployer,
		args: [usdcJoinAddress, d2OJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	const usdcPsmAddress = usdcPsm.receipt?.contractAddress;

	// ------------
	// Setup d2O
	// ------------

	await execute(
		"d2O_One",
		{from: deployer, log: true},
		"rely",
		d2OJoinAddress
	)

	await execute(
		"d2O_One",
		{from: deployer, log: true},
		"rely",
		LZPipeOneAddress
	)

	await execute(
		"d2O_Two",
		{from: deployer, log: true},
		"rely",
		LZPipeTwoAddress
	)

	// Need to permission connector two on d2O 2.

	// ---------------
	// Setup LMCVProxy
	// ---------------

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setD2OJoin",
		d2OJoinAddress
	)

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setD2O",
		d2O_OneAddress
	)

	// ----------
	// Setup LMCV
	// ----------

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		d2OJoinAddress, 1
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		usdcJoinAddress, 1
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setProtocolDebtCeiling",
		frad("5000000")
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"editAcceptedCollateralType",
		usdcBytes, fwad("1000000"), fwad("1"), fray("1"), false
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"updateSpotPrice",
		usdcBytes, fray("1")
	)

	// ---------
	// Setup PSM
	// ---------

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setPSMAddress",
		usdcPsmAddress, true
	)

	await execute(
		"UsdcJoin",
		{from: deployer, log: true},
		"rely",
		usdcPsmAddress
	)

	// ----------------
	// Set up endpoints
	// ----------------

	await execute(
		"LZEndPointMockOne",
		{from: deployer, log: true},
		"setDestLzEndpoint",
		LZPipeTwoAddress, LZEndpointMockTwoAddress
	)

	await execute(
		"LZEndPointMockTwo",
		{from: deployer, log: true},
		"setDestLzEndpoint",
		LZPipeOneAddress, LZEndpointMockOneAddress
	)

	await execute(
		"LZPipeOne",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdTwo, LZPipeTwoAddress
	)

	await execute(
		"LZPipeTwo",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdOne, LZPipeOneAddress
	)

	console.log("✅ Deployment successful.")
};
export default func;
func.tags = ['LMCV'];

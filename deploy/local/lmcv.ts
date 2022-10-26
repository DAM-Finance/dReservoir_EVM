import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

// TODO: Import via environment variable.
let usdcBytes = ethers.utils.formatBytes32String("USDC");	

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

	// dPrime

	const dPrimeOne = await deploy('dPrimeOne', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true,
		contract: "dPrime"
	});

	const dPrimeOneAddress = dPrimeOne.receipt?.contractAddress;

	const dPrimeTwo = await deploy('dPrimeTwo', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true,
		contract: "dPrime"
	});

	const dPrimeTwoAddress = dPrimeTwo.receipt?.contractAddress;

	// dPrime connector layer-zero

	const dPrimeConnectorLZOne = await deploy('dPrimeConnectorLZOne', {
		from: deployer,
		args: [LZEndpointMockOneAddress, dPrimeOneAddress],
		log: true,
		autoMine: true,
		contract: "dPrimeConnectorLZ"
	});

	const dPrimeConnectorLZOneAddress = dPrimeConnectorLZOne.receipt?.contractAddress;

	const dPrimeConnectorLZTwo = await deploy('dPrimeConnectorLZTwo', {
		from: deployer,
		args: [LZEndpointMockTwoAddress, dPrimeTwoAddress],
		log: true,
		autoMine: true,
		contract: "dPrimeConnectorLZ"
	});

	const dPrimeConnectorLZTwoAddress = dPrimeConnectorLZTwo.receipt?.contractAddress;

	// dPRIME Join. Can only mint and burn on one network.

	const dPrimeJoin = await deploy('dPrimeJoin', {
		from: deployer,
		args: [lmcvAddress, dPrimeOneAddress, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const dPrimeJoinAddress = dPrimeJoin.receipt?.contractAddress;

	// USDC Join

	const usdcJoin = await deploy('CollateralJoinDecimals', {		
		from: deployer,
		args: [lmcvAddress, lmcvProxyAddress, usdcBytes, usdcAddress],
		log: true,
		autoMine: true
	});

	const usdcJoinAddress = usdcJoin.receipt?.contractAddress;


	// USDC PSM

	const usdcPsm = await deploy('PSM', {		
		from: deployer,
		args: [usdcJoinAddress, dPrimeJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	const usdcPsmAddress = usdcPsm.receipt?.contractAddress;

	// ------------
	// Setup dPRIME
	// ------------

	await execute(
		"dPrimeOne",
		{from: deployer, log: true},
		"rely",
		dPrimeJoinAddress
	)

	await execute(
		"dPrimeOne",
		{from: deployer, log: true},
		"rely",
		dPrimeConnectorLZOneAddress
	)

	await execute(
		"dPrimeTwo",
		{from: deployer, log: true},
		"rely",
		dPrimeConnectorLZTwoAddress
	)

	// Need to permission connector two on dprime 2.

	// ---------------
	// Setup LMCVProxy
	// ---------------

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setDPrimeJoin",
		dPrimeJoinAddress
	)

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setDPrime",
		dPrimeOneAddress
	)

	// ----------
	// Setup LMCV
	// ----------

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		dPrimeJoinAddress, 1
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
		"CollateralJoinDecimals",
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
		dPrimeConnectorLZTwoAddress, LZEndpointMockTwoAddress
	)

	await execute(
		"LZEndPointMockTwo",
		{from: deployer, log: true},
		"setDestLzEndpoint",
		dPrimeConnectorLZOneAddress, LZEndpointMockOneAddress
	)

	await execute(
		"dPrimeConnectorLZOne",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdTwo, dPrimeConnectorLZTwoAddress
	)

	await execute(
		"dPrimeConnectorLZTwo",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdOne, dPrimeConnectorLZOneAddress
	)

	console.log("✅ Deployment successful.")
};
export default func;
func.tags = ['LMCV'];

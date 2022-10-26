import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

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

	const usdcAddress = process.env['USDC_ADDRESS_GOERLI'];
	const usdcBytes = ethers.utils.formatBytes32String("USDC");	

	// ----------
	// Layer Zero
	// ----------

	// LayerZero End-Point address.
	const layerZeroEndpointAddress = process.env['LAYER_ZERO_ENDPOINT_GOERLI'];

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

	const dPrime = await deploy('dPrime', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const dPrimeAddress = dPrime.receipt?.contractAddress;

	// dPrime connector layer-zero

	const dPrimeConnectorLZ = await deploy('dPrimeConnectorLZ', {
		from: deployer,
		args: [layerZeroEndpointAddress, dPrimeAddress],
		log: true,
		autoMine: true,
		contract: "dPrimeConnectorLZ"
	});

	const dPrimeConnectorLZAddress = dPrimeConnectorLZ.receipt?.contractAddress;

	// HYPERLANE PIPE

	const HyperlanePipe = await deploy('dPrimeConnectorHyperlane', {		
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const HyperlanePipeAddress = HyperlanePipe.receipt?.contractAddress;

	// dPrime Join.

	const dPrimeJoin = await deploy('dPrimeJoin', {
		from: deployer,
		args: [lmcvAddress, dPrimeAddress, lmcvProxyAddress],
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
		"dPrime",
		{from: deployer, log: true},
		"rely",
		dPrimeJoinAddress
	)

	await execute(
		"dPrime",
		{from: deployer, log: true},
		"rely",
		dPrimeConnectorLZAddress
	)

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
		dPrimeAddress
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

	// await execute(
	// 	"LZEndPointMockOne",
	// 	{from: deployer, log: true},
	// 	"setDestLzEndpoint",
	// 	dPrimeConnectorLZTwoAddress, LZEndpointMockTwoAddress
	// )

	// await execute(
	// 	"LZEndPointMockTwo",
	// 	{from: deployer, log: true},
	// 	"setDestLzEndpoint",
	// 	dPrimeConnectorLZOneAddress, LZEndpointMockOneAddress
	// )

	// await execute(
	// 	"dPrimeConnectorLZ",
	// 	{from: deployer, log: true},
	// 	"setTrustedRemoteAddress",
	// 	chainIdTwo, dPrimeConnectorLZTwoAddress
	// )

	console.log("✅ Deployment successful.")
};
export default func;
func.tags = ['LMCV'];

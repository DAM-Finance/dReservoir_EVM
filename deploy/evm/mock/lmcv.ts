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

const deployLMCV: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	// Deploy the base LMCV contract.

	const lmcv = await deploy("LMCV", {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	// Deploy LMCV proxy contract.
	
	const lmcvAddress = lmcv.receipt?.contractAddress;

	const lmcvProxy = await deploy("LMCVProxy", {
		from: deployer,
		args: [lmcvAddress],
		log: true,
		autoMine: true
	});

	// Deploy d2o join.

	const lmcvProxyAddress 	= lmcvProxy.receipt?.contractAddress;
	const d2o 				= await deployments.get("d2oOne");

	const d2oJoin = await deploy("d2oJoin", {
		from: deployer,
		args: [lmcvAddress, d2o.address, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	// Deploy mock collateral token and the join contract for it.

	let usdcName 	= ethers.utils.formatBytes32String("USD Coin");
	let usdcSymbol 	= ethers.utils.formatBytes32String("USDC");

	const usdc = await deploy("USDC", {
		from: deployer,
		args: [usdcName, usdcSymbol],
		log: true,
		autoMine: true,
		contract: "TestERC20"
	});

	const usdcBytes 		= ethers.utils.formatBytes32String("PSM-USDC");	
	const usdcAddress 		= usdc.receipt?.contractAddress;

	const usdcJoin = await deploy("USDCJoin", {		
		from: deployer,
		args: [lmcvAddress, lmcvProxyAddress, usdcBytes, usdcAddress],
		log: true,
		autoMine: true,
		contract: "CollateralJoinDecimals"
	});

	// Deploy peg stability module.

	const d2oJoinAddress 	= d2oJoin.receipt?.contractAddress;
	const usdcJoinAddress 	= usdcJoin.receipt?.contractAddress;

	const psm = await deploy("PSM", {		
		from: deployer,
		args: [usdcJoinAddress, d2oJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	// Permission d2oJoin to mint and burn d2oOne.

	await execute(
		"d2oOne",
		{from: deployer, log: true},
		"rely",
		d2oJoinAddress
	);

	// Setup for LMCVProxy.

	const d2oOne = await deployments.get("d2oOne");

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setD2oJoin",
		d2oJoinAddress
	);

	await execute(
		"LMCVProxy",
		{from: deployer, log: true},
		"setD2o",
		d2oOne.address
	);

	// Setup the LMCV.

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		d2oJoinAddress, 1
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

	// Set up PSM contract.

	const psmAddress = psm.receipt?.contractAddress;

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setPSMAddress",
		psmAddress, true
	)

	await execute(
		"USDCJoin",
		{from: deployer, log: true},
		"rely",
		psmAddress
	)

	console.log("✅ LMCV deployment successful.")
};

module.exports = deployLMCV;
module.exports.tags = ["lmcv", "mock"];
module.exports.dependencies = ["d2o"];

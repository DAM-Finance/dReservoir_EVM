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
	const d2o 				= await deployments.get("d2o");

	const d2oJoin = await deploy("d2oJoin", {
		from: deployer,
		args: [lmcvAddress, d2o.address, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const d2oJoinAddress = d2oJoin.receipt?.contractAddress;

	await execute(
		"d2o",
		{from: deployer, log: true},
		"rely",
		d2oJoinAddress
	);

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
		d2o.address
	);

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		d2oJoinAddress, 1
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setTreasury",
		treasury
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setProtocolDebtCeiling",
		frad("10000000")
	)

	console.log("✅ LMCV deployment and setup successful.")
};

module.exports = deployLMCV;
module.exports.tags = ["lmcv"];
module.exports.dependencies = ["d2o"];

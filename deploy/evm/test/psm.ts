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

const deployPSM: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

    const tokenSymbol: string | undefined = process.env["TOKEN_SYMBOL"];
	if (!tokenSymbol) {
		throw new Error("Please set TOKEN_SYMBOL");
	}

	const d2oJoin 	= await deployments.get("d2oJoin");
	const tokenJoin = await deployments.get(`${tokenSymbol}Join`);

	const psm = await deploy("PSM", {		
		from: deployer,
		args: [tokenJoin.address, d2oJoin.address, treasury],
		log: true,
		autoMine: true
	});

	const psmAddress = psm.receipt?.contractAddress;

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"setPSMAddress",
		psmAddress, true
	)

	await execute(
		`${tokenSymbol}Join`,
		{from: deployer, log: true},
		"rely",
		psmAddress
	)

	console.log("✅ PSM deployment and setup successful.")
};

module.exports = deployPSM;
module.exports.tags = ["psm"];
module.exports.dependencies = ["collateral"];





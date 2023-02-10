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

const deployCollateral: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer} = await getNamedAccounts();

	// Deploy mock collateral token and the join contract for it.

    const tokenName: string | undefined = process.env["TOKEN_NAME"];
	if (!tokenName) {
		throw new Error("Please set TOKEN_SYMBOL");
	}

    const tokenSymbol: string | undefined = process.env["TOKEN_SYMBOL"];
	if (!tokenSymbol) {
		throw new Error("Please set TREASURY_ADDRESS");
	}

    const tokenContract = await deploy(tokenSymbol, {
        from: deployer,
        args: [tokenName, tokenSymbol],
        log: true,
        autoMine: true,
        contract: "TestERC20"
    });

	const psmString 		= `PSM-${tokenSymbol}`
    const psmBytes 			= ethers.utils.formatBytes32String(psmString);	
    const tokenAddress 		= tokenContract.receipt?.contractAddress;
	const LMCV				= await deployments.get("LMCV");
	const LMCVProxy			= await deployments.get("LMCVProxy");

    const tokenJoin = await deploy(`${tokenSymbol}Join`, {		
        from: deployer,
        args: [LMCV.address, LMCVProxy.address, psmBytes, tokenAddress],
        log: true,
        autoMine: true,
        contract: "CollateralJoinDecimals"
    });

	const tokenJoinAddress = tokenJoin.receipt?.contractAddress;

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"administrate",
		tokenJoinAddress, 1
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"editAcceptedCollateralType",
		psmBytes, fwad("1000000"), fwad("1"), fray("1"), false
	)

	await execute(
		"LMCV",
		{from: deployer, log: true},
		"updateSpotPrice",
		psmBytes, fray("1")
	)

	console.log("✅ Collateral deployment and setup successful.")
};

module.exports = deployCollateral;
module.exports.tags = ["collateral"];
module.exports.dependencies = [];



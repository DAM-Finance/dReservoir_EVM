import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
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


task("setup_contracts_ethereum", "sets up contracts ready for use on Goerli")
    .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

    const deployedContracts = await deployments.all();

	if (hre.network.name != "ethereum") {
		console.error("Error: Must be run with --network set to ethereum.");
        process.exit(1);
	}

	// Closure for executing transaction to reduce code repetition.
	async function transaction(contractName: string, methodName: string, ...params) {
		try {
			console.log(`${contractName}:${methodName}()`);
			const result = await execute(
				contractName,
				{from: deployer, log: true},
				methodName,
				...params
			)
			console.log("Transaction successful: ", result.transactionHash);
		} catch (e) {
			console.log(e);
		}
	}

    const usdcPsmSymbol: string | undefined = process.env['USDC_PSM_SYMBOL'];
	if (!usdcPsmSymbol) {
		throw new Error("Please set USDC_PSM_SYMBOL in a .env file");
	}
	const usdcPsmBytes = ethers.utils.formatBytes32String(usdcPsmSymbol);

	const lzMoonbeamChainId = process.env["LAYER_ZERO_CHAIN_ID_MOONBEAM"];
	if (!lzMoonbeamChainId) {
		throw new Error("Please set LAYER_ZERO_CHAIN_ID_MOONBASE in a .env file");
	}

	const lzMoonbeamPipeAddress = process.env["LAYER_ZERO_PIPE_MOONBEAM"];
	if (!lzMoonbeamPipeAddress) {
		throw new Error("Please set LAYER_ZERO_PIPE_MOONBEAM in a .env file");
	}

	// ---------------------------
	// Setup dPrime and connectors
	// ---------------------------

	await transaction(
		"d2O", 
		"rely", 
		deployedContracts["d2OJoin"].address
	);

	await transaction(
		"d2O",
		"rely",
		deployedContracts["LayerZeroPipe"].address
	);

	// ---------------
	// Setup LMCVProxy
	// ---------------

	await transaction(
		"LMCVProxy",
		"setD2OJoin",
		deployedContracts["d2OJoin"].address
	);

	await transaction(
		"LMCVProxy",
		"setD2O",
		deployedContracts["d2O"].address
	);

	// ----------
	// Setup LMCV
	// ----------

	await transaction(
		"LMCV",
		"administrate",
		deployedContracts["d2OJoin"].address, 1
	);

	await transaction(
		"LMCV",
		"administrate",
		deployedContracts["usdcJoin"].address, 1
	);

	await transaction(
		"LMCV",
		"setProtocolDebtCeiling",
		frad("1000000000")
	);
	
	await transaction(
		"LMCV",
		"editAcceptedCollateralType",
		usdcPsmBytes, fwad("1000000000"), fwad("1"), fray("1"), false
	);
	
	await transaction(
		"LMCV",
		"updateSpotPrice",
		usdcPsmBytes, fray("1")
	);

	// ---------
	// Setup PSM
	// ---------

	await transaction(
		"LMCV",
		"setPSMAddress",
		deployedContracts["PSM"].address, true
	);

	await transaction(
		"usdcJoin",
		"rely",
		deployedContracts["PSM"].address
	);

	// -----------------
	// Set up connectors
	// -----------------

	await transaction(
		"LayerZeroPipe",
		"setTrustedRemoteAddress",
		lzMoonbeamChainId, lzMoonbeamPipeAddress
	);
});


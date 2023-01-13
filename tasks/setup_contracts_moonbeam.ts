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

// TODO: Finish this off for Moonbase.
task("setup_contracts_moonbeam", "sets up contracts ready for use on Moonbase")
    .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

    const deployedContracts = await deployments.all();

	if (hre.network.name != "moonbeam") {
		console.error("Error: Must be run with --network set to moonbeam.");
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

	// Layer Zero.

	const lzEthereumChainId = process.env["LAYER_ZERO_CHAIN_ID_ETHEREUM"];
	if (!lzEthereumChainId) {
		throw new Error("Please set LAYER_ZERO_CHAIN_ID_ETHEREUM in a .env file");
	}

	const lzEthereumPipeAddress = process.env["LAYER_ZERO_PIPE_ETHEREUM"];
	if (!lzEthereumPipeAddress) {
		throw new Error("Please set LAYER_ZERO_PIPE_ETHEREUM in a .env file");
	}

	// ---------------------------
	// Setup dPrime and connectors
	// ---------------------------

	await transaction(
		"d2O",
		"rely",
		deployedContracts["LayerZeroPipe"].address
	);

	// -----------------
	// Set up connectors
	// -----------------

	await transaction(
		"LayerZeroPipe",
		"setTrustedRemoteAddress",
		lzEthereumChainId, lzEthereumPipeAddress
	);

});


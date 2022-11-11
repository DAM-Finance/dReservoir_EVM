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
task("setup_contracts_moonbase", "sets up contracts ready for use on Moonbase")
    .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

    const deployedContracts = await deployments.all();

	if (hre.network.name != "moonbase") {
		console.error("Error: Must be run with --network set to moonbase.");
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

	// Hyperlane.

    const hyperlaneConnectionManagerAddress: string | undefined  = process.env["HYPERLANE_CONNECTION_MANAGER_MOONBASE"];
    if (!hyperlaneConnectionManagerAddress) {
		throw new Error("Please set HYPERLANE_CONNECTION_MANAGER_MOONBASE in a .env file");
	}

	const hyperlaneInterchainGasMasterAddress: string | undefined  = process.env["HYPERLANE_INTERCHAIN_GAS_PAYMASTER_MOONBASE"];
    if (!hyperlaneInterchainGasMasterAddress) {
		throw new Error("Please set HYPERLANE_INTERCHAIN_GAS_PAYMASTER_MOONBASE in a .env file");
	}

	const hyperlaneDomainIdentifierGoerli = process.env["HYPERLANE_DOMAIN_IDENTIFIER_GOERLI"];
	if (!hyperlaneDomainIdentifierGoerli) {
		throw new Error("Please set HYPERLANE_DOMAIN_IDENTIFIER_GOERLI in a .env file");
	}
	
	const hyperlaneGoerliConnectorAddress = process.env["HYPERLANE_GOERLI_CONNECTOR_ADDRESS"];
	if (!hyperlaneGoerliConnectorAddress) {
		throw new Error("Please set HYPERLANE_MOONBASE_CONNECTOR_ADDRESS in a .env file");
	}

	// Layer Zero.

	const lzGoerliChainId = process.env["LAYER_ZERO_CHAIN_ID_GOERLI"];
	if (!lzGoerliChainId) {
		throw new Error("Please set LAYER_ZERO_CHAIN_ID_MOONBASE in a .env file");
	}

	const lzGoerliConnectorAddress = process.env["LAYER_ZERO_GOERLI_CONNECTOR_ADDRESS"];
	if (!lzGoerliConnectorAddress) {
		throw new Error("Please set LAYER_ZERO_MOONBASE_CONNECTOR_ADDRESS in a .env file");
	}

	// ---------------------------
	// Setup dPrime and connectors
	// ---------------------------

	await transaction(
		"dPrime", 
		"rely", 
		deployedContracts["dPrimeJoin"].address
	);

	await transaction(
		"dPrime",
		"rely",
		deployedContracts["dPrimeConnectorLZ"].address
	);

	await transaction(
		"dPrime",
		"rely",
		deployedContracts["dPrimeConnectorHyperlane"].address
	);

	await transaction(
		"dPrimeConnectorHyperlane",
		"initialize",
		hyperlaneConnectionManagerAddress, hyperlaneInterchainGasMasterAddress, deployedContracts["dPrime"].address
	);

	// -----------------
	// Set up connectors
	// -----------------

	await transaction(
		"dPrimeConnectorLZ",
		"setTrustedRemoteAddress",
		lzGoerliChainId, lzGoerliConnectorAddress
	);

	await transaction(
		"dPrimeConnectorHyperlane",
		"enrollRemoteRouter",
		hyperlaneDomainIdentifierGoerli, ethers.utils.hexZeroPad(hyperlaneGoerliConnectorAddress, 32)
	);

});


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


task("setup_contracts_goerli", "sets up contracts ready for use on Goerli")
    .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

    const deployedContracts = await deployments.all();

	if (hre.network.name != "goerli") {
		console.error("Error: Must be run with --network set to goerli.");
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

    const hyperlaneConnectionManagerAddress: string | undefined  = process.env["HYPERLANE_CONNECTION_MANAGER_GOERLI"];
    if (!hyperlaneConnectionManagerAddress) {
		throw new Error("Please set HYPERLANE_CONNECTION_MANAGER_GOERLI in a .env file");
	}

	const hyperlaneInterchainGasMasterAddress: string | undefined  = process.env["HYPERLANE_INTERCHAIN_GAS_PAYMASTER_GOERLI"];
    if (!hyperlaneInterchainGasMasterAddress) {
		throw new Error("Please set HYPERLANE_INTERCHAIN_GAS_PAYMASTER_GOERLI in a .env file");
	}

	const hyperlaneDomainIdentifierMoonbase = process.env["HYPERLANE_DOMAIN_IDENTIFIER_MOONBASE"];
	if (!hyperlaneDomainIdentifierMoonbase) {
		throw new Error("Please set HYPERLANE_DOMAIN_IDENTIFIER_MOONBASE in a .env file");
	}
	
	const hyperlaneMoonbaseConnectorAddress = process.env["HYPERLANE_MOONBASE_CONNECTOR_ADDRESS"];
	if (!hyperlaneMoonbaseConnectorAddress) {
		throw new Error("Please set HYPERLANE_MOONBASE_CONNECTOR_ADDRESS in a .env file");
	}

	const lzMoonbaseChainId = process.env["LAYER_ZERO_CHAIN_ID_MOONBASE"];
	if (!lzMoonbaseChainId) {
		throw new Error("Please set LAYER_ZERO_CHAIN_ID_MOONBASE in a .env file");
	}

	const lzMoonbaseConnectorAddress = process.env["LAYER_ZERO_MOONBASE_CONNECTOR_ADDRESS"];
	if (!lzMoonbaseConnectorAddress) {
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

	// ---------------
	// Setup LMCVProxy
	// ---------------

	await transaction(
		"LMCVProxy",
		"setDPrimeJoin",
		deployedContracts["dPrimeJoin"].address
	);

	await transaction(
		"LMCVProxy",
		"setDPrime",
		deployedContracts["dPrime"].address
	);

	// ----------
	// Setup LMCV
	// ----------

	await transaction(
		"LMCV",
		"administrate",
		deployedContracts["dPrimeJoin"].address, 1
	);

	await transaction(
		"LMCV",
		"administrate",
		deployedContracts["usdcJoin"].address, 1
	);

	await transaction(
		"LMCV",
		"setProtocolDebtCeiling",
		frad("5000000")
	);
	
	await transaction(
		"LMCV",
		"editAcceptedCollateralType",
		usdcPsmBytes, fwad("1000000"), fwad("1"), fray("1"), false
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
		"dPrimeConnectorLZ",
		"setTrustedRemoteAddress",
		lzMoonbaseChainId, lzMoonbaseConnectorAddress
	);

	await transaction(
		"dPrimeConnectorHyperlane",
		"enrollRemoteRouter",
		hyperlaneDomainIdentifierMoonbase, ethers.utils.hexZeroPad(hyperlaneMoonbaseConnectorAddress, 32)
	);
});


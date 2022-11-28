import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

task("d2O_teleport", "teleports d2O from one chain to another")
  .addParam("amount", "The amount of d2O to teleport")
  .addOptionalParam("sourceChainId", "The source chain id")
  .addOptionalParam("destChainId", "The destination chain id")
  .addParam("user", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	let contractName, source, destination
	if (hre.network.name === "localhost") {
		if (taskArgs.sourceChainId === undefined) {
			throw new Error("source-chain-id must be set for localhost.")
		}
		if (taskArgs.destChainId === undefined) {
			throw new Error("dest-chain-id must be set for localhost.")
		}
		if (taskArgs.sourceChainId == taskArgs.destChainId) {
			console.log("SourceChainId and DestChainId must be different.");
			return;
		}
		contractName = taskArgs.sourceChainId == 1 ? "d2OConnectorLZOne" : "d2OConnectorLZTwo";
		[source, destination] = [taskArgs.sourceChainId, taskArgs.destChainId]
	} else if (hre.network.name === "goerli") {
		contractName = "LayerZeroPipe";
		const sourceId: string | undefined = process.env['LAYER_ZERO_CHAIN_ID_GOERLI'];
		if (!sourceId) {
			throw new Error("Please set LAYER_ZERO_CHAIN_ID_GOERLI in a .env file");
		}
		const destId: string | undefined = process.env['LAYER_ZERO_CHAIN_ID_MOONBASE'];
		if (!destId) {
			throw new Error("Please set LAYER_ZERO_CHAIN_ID_MOONBASE in a .env file");
		}
		[source, destination] = [sourceId, destId]
		console.log(destination)
	} else if (hre.network.name === "moonbase") {
		contractName = "LayerZeroPipe";
		const sourceId: string | undefined = process.env['LAYER_ZERO_CHAIN_ID_GOERLI'];
		if (!sourceId) {
			throw new Error("Please set LAYER_ZERO_CHAIN_ID_GOERLI in a .env file");
		}
		const destId: string | undefined = process.env['LAYER_ZERO_CHAIN_ID_MOONBASE'];
		if (!destId) {
			throw new Error("Please set LAYER_ZERO_CHAIN_ID_MOONBASE in a .env file");
		}
		[destination, source] = [sourceId, destId]
		console.log(destination)
	} else {
		console.log("Unsupported network");
		return;
	}

	const {deployments, getNamedAccounts} = hre;
	const {execute, read} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	// Estimate teleport fee.

	console.log(`Estimating teleport fee...`);

	console.log(source)
	console.log(destination)
	console.log(taskArgs.amount)

	const feeEstimate = await read(
		contractName,
		{from: taskArgs.user},
		"estimateSendFee",
		destination, taskArgs.user, fwad(taskArgs.amount), false, []
	);

	console.log("Fee estimate: ", ethers.utils.formatEther(feeEstimate.nativeFee));

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} d2O...`);

	await execute(
		contractName, 
		{from: taskArgs.user, log: true, value: feeEstimate.nativeFee},
		"sendFrom",
		taskArgs.user,						// User address.
		destination,						// Destination chain Id.
		taskArgs.user,						// To address.
		fwad(taskArgs.amount),				// Amount.
		taskArgs.user,						// Refund address.
		taskArgs.user,						// Payment address.
		[]
	);

	console.log("✅ Teleport successful.")

	await hre.run("d2O_balance", {user: taskArgs.user});

});
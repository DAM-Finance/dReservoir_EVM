import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

task("teleport", "teleports dPrime from one chain to another")
  .addParam("amount", "The amount of dPrime to teleport")
  .addParam("sourceChainId", "The source chain id")
  .addParam("destChainId", "The destination chain id")
  .addParam("user", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute, read} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	if (taskArgs.sourceChainId == taskArgs.destChainId) {
		console.log("SourceChainId and DestChainId must be different.");
		return;
	}

	const contractName = taskArgs.sourceChainId == 1 ? "dPrimeConnectorLZOne" : "dPrimeConnectorLZTwo"

	// Estimate teleport fee.

	console.log(`Estimating teleport fee...`);

	const feeEstimate = await read(
		contractName,
		{from: taskArgs.user},
		"estimateSendFee",
		2, taskArgs.user, fwad(taskArgs.amount), false, []
	);

	console.log("Fee estimate: ", ethers.utils.formatEther(feeEstimate.nativeFee));

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} dPrime...`);

	await execute(
		contractName, 
		{from: taskArgs.user, log: true, value: feeEstimate.nativeFee},
		"sendFrom",
		taskArgs.user,						// User address.
		taskArgs.destChainId,				// Destination chain Id.
		taskArgs.user,						// To address.
		fwad(taskArgs.amount),				// Amount.
		taskArgs.user,						// Refund address.
		taskArgs.user,						// Payment address.
		[]
	);

	console.log("✅ Teleport successful.")

	await hre.run("dprime_balance", {user: taskArgs.user});

});
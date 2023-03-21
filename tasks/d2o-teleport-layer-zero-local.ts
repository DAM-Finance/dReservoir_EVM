import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

task("d2o-teleport-layer-zero-local", "teleports d2O from one chain to another")
  .addParam("amount", "The amount of d2O to teleport")
  .addOptionalParam("source", "The source chain id")
  .addOptionalParam("dest", "The destination chain id")
  .addParam("address", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute, read} = deployments;

	// Estimate teleport fee.

	console.log(`Estimating teleport fee...`);

	const contractName = taskArgs.source == 1 ? "LayerZeroPipeOne" : "LayerZeroPipeTwo";

	const feeEstimate = await read(
		contractName,
		{from: taskArgs.address},
		"estimateSendFee",
		taskArgs.dest, taskArgs.address, fwad(taskArgs.amount), false, []
	);

	console.log("Fee estimate: ", ethers.utils.formatEther(feeEstimate.nativeFee));

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} d2o...`);

	await execute(
		contractName, 
		{from: taskArgs.address, log: true, value: feeEstimate.nativeFee},
		"sendFrom",
		taskArgs.address,					// User address.
		taskArgs.dest,						// Destination chain Id.
		taskArgs.address,					// To address.
		fwad(taskArgs.amount),				// Amount.
		taskArgs.address,					// Refund address.
		taskArgs.address,					// Payment address.
		[]
	);

	console.log("✅ Teleport successful.");
});
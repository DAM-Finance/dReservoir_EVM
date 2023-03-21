import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

task("d2o-teleport-layer-zero", "teleports d2O from one chain to another USING LZV2 CALLS")
  .addParam("amount", "The amount of d2O to teleport")
  .addParam("dest", "The destination chain id")
  .addParam("address", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute, read} = deployments;

	function byteify(address) {
        return ethers.utils.hexZeroPad(ethers.utils.hexlify(address), 32)
    }

	// Estimate teleport fee.

	console.log(`Estimating teleport fee...`);

	const toAddress = byteify(taskArgs.address)

	const feeEstimate = await read(
		"LayerZeroPipe",
		{from: taskArgs.address},
		"estimateSendFee",
		taskArgs.dest, toAddress, fwad(taskArgs.amount), false, []
	);

	console.log("Fee estimate: ", ethers.utils.formatEther(feeEstimate.nativeFee));

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} d2o...`);

	await execute(
		"LayerZeroPipe", 
		{from: taskArgs.address, log: true, value: feeEstimate.nativeFee},
		"sendFrom",
		taskArgs.address,					// User address.
		taskArgs.dest,						// Destination chain Id.
		toAddress,					// To address.
		fwad(taskArgs.amount),				// Amount.
		{refundAddress: taskArgs.address,					// Refund address.
		zroPaymentAddress: taskArgs.address,					// Payment address.
		adapterParams: []}
	);

	console.log("✅ Teleport successful.");
});
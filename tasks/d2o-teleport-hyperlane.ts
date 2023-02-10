import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

function byteify(address: string) {
    return ethers.utils.hexZeroPad(ethers.utils.hexlify(address), 32)
}

task("d2o-teleport-hyperlane", "teleports d2O from one chain to another")
  .addParam("amount", "The amount of d2O to teleport")
  .addOptionalParam("source", "The source chain id")
  .addOptionalParam("dest", "The destination chain id")
  .addParam("address", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute} = deployments;

	const contractName = taskArgs.source == 1 ? "HyperlanePipeOne" : "HyperlanePipeTwo";

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} d2o...`);
	
	await execute(
		contractName, 
		{from: taskArgs.address, log: true, value: 100000},
		"transferRemote",
		taskArgs.dest,				// Destination chain id.
		byteify(taskArgs.address), 	// Address.
		fwad(taskArgs.amount),		// Amount.		
	);

	// Manually perofrm message processing.

	const method = taskArgs.source == 1 ? "processNextPendingMessage" : "processNextPendingMessageFromDestination";

	await execute(
		"MockHyperlaneEnvironment",
		{from: taskArgs.address, log: true},
		method
	);

	console.log("✅ Teleport successful.");
});
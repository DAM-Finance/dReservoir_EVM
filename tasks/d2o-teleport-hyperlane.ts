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
  .addParam("env", "mock, test or main")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute} = deployments;

	let contractName = "";
	if (taskArgs.env === "mock") {
		contractName = taskArgs.source == 1 ? "HyperlanePipeOne" : "HyperlanePipeTwo";
	} else {
		contractName = "HyperlanePipe"
	}

	// Execute teleport.

	console.log(`Teleporting ${taskArgs.amount} d2o...`);
	
	try {
		await execute(
			contractName, 
			{from: taskArgs.address, log: true, value: 10000000},
			"transferRemote",
			taskArgs.dest,				// Destination chain id.
			byteify(taskArgs.address), 	// Address.
			fwad(taskArgs.amount),		// Amount.		
		);
	} catch (e) {
		console.log(e.message);
		throw e;
	}

	// Manually perofrm message processing for mock networks.

	if (taskArgs.env == "mock") {
		const method = taskArgs.source == 1 ? "processNextPendingMessage" : "processNextPendingMessageFromDestination";
		await execute(
			"MockHyperlaneEnvironment",
			{from: taskArgs.address, log: true},
			method
		);
	}

	console.log("✅ Teleport successful.");
});
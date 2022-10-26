import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

task("teleport", "teleports dPrime from one chain to another")
  .addParam("amount", "The amount of dPrime to teleport")
  .addParam("chainId", "The destination chain id")
  .addParam("user", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute, read} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	// Estimate teleport fee.

	const feeEstimate = await read(
		"dPrimeConnectorLZOne",
		{from: user},
		"estimateSendFee",
		2, user, fwad("100"), false, []
	);

	console.log("Fee estimate: ", feeEstimate.nativeFee);

	// Execute teleport.

	await execute(
		"dPrimeConnectorLZOne", 
		{from: user, log: true, value: feeEstimate.nativeFee},
		"sendFrom",
		user,						// User address.
		taskArgs.chainId,					// Destination chain Id.
		user,						// To address.
		fwad("1000"),				// Amount.
		user,						// Refund address.
		user,						// Payment address.
		[]
	);

});




// async function main() {
// 	const {deployments, getNamedAccounts} = hre;
// 	const {execute, read} = deployments;
// 	const {deployer, treasury, user} = await getNamedAccounts();

// }

// main()
// 	.then(() => process.exit(0))
// 	.catch((error) => {
// 		console.error(error);
// 		process.exit(1);
// 	});
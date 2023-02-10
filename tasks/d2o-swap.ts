import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

let usdcBytes = ethers.utils.formatBytes32String("PSM-USDC");	

task("d2o-swap", "swaps USDC into d2o")
  .addParam("amount", "The amount of d2O to swap")
  .addParam("address", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;

	// Provide approval.

	console.log("Approving USDCJoin...");

	const USDCJoin = await deployments.get("USDCJoin");

	const approveResult = await execute(
		"USDC", 
		{from: taskArgs.address, log: true},
		"approve",
		USDCJoin.address, ethers.utils.parseUnits(taskArgs.amount, 6)	// USDC has 6 decimal places.
	);

	console.log("Approve successful: ", approveResult.transactionHash);

	// Execute PSM swap.

	console.log(`Swapping ${taskArgs.amount} of USDC for ${taskArgs.amount} d2O...`);

	const swapResult = await execute(
		"PSM", 
		{from: taskArgs.address, log: true},
		"createD2o",
		taskArgs.address,
		[usdcBytes],
		[ethers.utils.parseUnits(taskArgs.amount, 6).toString()]
	);

	console.log("✅ d2o/USDC swap successful: ", swapResult.transactionHash);
});
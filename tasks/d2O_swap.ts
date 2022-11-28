import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

let usdcBytes = ethers.utils.formatBytes32String("PSM-USDC-DAM");	

task("d2O_swap", "teleports d2O from one chain to another")
  .addParam("amount", "The amount of d2O to swap")
  .addParam("user", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;

	const usdcJoinAddress = await (await deployments.get("usdcJoin")).address;

	// Provide approval.

	console.log("Approving USDCJoin...");

	const approveResult = await execute(
		"USDC", 
		{from: taskArgs.user, log: true},
		"approve",
		usdcJoinAddress, ethers.utils.parseUnits(taskArgs.amount, 6)	// USDC has 6 decimal places.
	);

	console.log("Approve successful: ", approveResult.transactionHash);

	// Execute PSM swap.

	console.log(`Swapping ${taskArgs.amount} of USDC for ${taskArgs.amount} d2O...`);

	const swapResult = await execute(
		"PSM", 
		{from: taskArgs.user, log: true},
		"createD2O",
		taskArgs.user,
		[usdcBytes],
		[ethers.utils.parseUnits(taskArgs.amount, 6).toString()]
	);

	console.log("✅ Swap successful: ", swapResult.transactionHash);

	await hre.run("d2O_balance", {user: taskArgs.user});
	await hre.run("usdc_balance", {user: taskArgs.user});
	await hre.run("eth_balance", {user: taskArgs.user});
});
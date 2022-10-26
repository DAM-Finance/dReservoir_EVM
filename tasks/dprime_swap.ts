import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

function fwad(wad: string) { 
	return ethers.utils.parseEther(wad); 
}

let usdcBytes = ethers.utils.formatBytes32String("USDC");	

task("dprime_swap", "teleports dPrime from one chain to another")
  .addParam("amount", "The amount of dPrime to swap")
  .addParam("user", "The user's address to send from")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute, read} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	const usdcJoinAddress = await (await deployments.get("CollateralJoinDecimals")).address;

	// Provide approval.

	console.log("Approving USDCJoin...");

	const approveResult = await execute(
		"USDC", 
		{from: taskArgs.user, log: true},
		"approve",
		usdcJoinAddress, fwad(taskArgs.amount)
	);

	// Execute PSM swap.

	console.log(`Swapping ${taskArgs.amount} of USDC for ${taskArgs.amount} dPrime...`);

	const swapResult = await execute(
		"PSM", 
		{from: taskArgs.user, log: true},
		"createDPrime",
		taskArgs.user,
		[usdcBytes],
		[fwad(String(taskArgs.amount/100))]		// Decimals for USDC is 16, not 18.
	);

	console.log("✅ Swap successful.")

	await hre.run("dprime_balance", {user: taskArgs.user});
	await hre.run("usdc_balance", {user: taskArgs.user});
	await hre.run("eth_balance", {user: taskArgs.user});
});
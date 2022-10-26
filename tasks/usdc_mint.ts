import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc_mint", "mints USDC for a specified user")
  .addParam("amount", "The amount of USDC to mint")
  .addParam("user", "The user's address to mint to")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute} = deployments;

	console.log(`Minting ${taskArgs.amount} dPrime to ${taskArgs.user.substring(0, 10)}...`)

	const result = await execute(
		"USDC", 
		{from: taskArgs.user, log: true},
		"mint",
		taskArgs.user, ethers.utils.parseEther(taskArgs.amount)
	);

	console.log("✅ Mint successful.")

	await hre.run("usdc_balance", {user: taskArgs.user});
});
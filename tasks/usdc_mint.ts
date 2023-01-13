import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc_mint", "mints USDC for a specified user")
  .addParam("amount", "The amount of USDC to mint")
  .addParam("user", "The user's address to mint to")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute} = deployments;

	const amount = ethers.utils.parseUnits(taskArgs.amount, 6);
	console.log(`Minting ${taskArgs.amount} USDC to ${taskArgs.user.substring(0, 10)}...`)
	const network = hre.network.name;

	switch (network) {
		case "localhost":
			await execute("USDC", {from: taskArgs.user, log: true}, "mint", taskArgs.user, amount);
			break;
		case "goerli":
			await execute("USDC", {from: taskArgs.user, log: true}, "mint", taskArgs.user, amount);
			break;
		default:
			console.log(`Network ${network} not supported for task usdc_mint.`);
			return;
	}
	
	console.log("✅ Mint successful.")
	await hre.run("usdc_balance", {user: taskArgs.user});
});
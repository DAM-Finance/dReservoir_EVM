import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc-mint", "mints USDC for a specified user")
  .addParam("amount", "The amount of USDC to mint")
  .addParam("address", "The user's address to mint to")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {execute} = deployments;
	const amount = ethers.utils.parseUnits(taskArgs.amount, 6);
	console.log(`Minting ${taskArgs.amount} USDC to ${taskArgs.address}...`)
	await execute("USDC", {from: taskArgs.address, log: true}, "mint", taskArgs.address, amount);
	console.log("✅ Test USDC mint successful.")
	await hre.run("usdc-balance", {address: taskArgs.address});
});
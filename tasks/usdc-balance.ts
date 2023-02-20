import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc-balance", "gets the USDC balance for an account")
  	.addParam("address", "The user's address")
  	.setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
		const {deployments} = hre;
		const {read} = deployments;
		const balance = await read("USDC", {from: taskArgs.address}, "balanceOf", taskArgs.address);
		console.log(`User ${taskArgs.address} USDC balance:`, ethers.utils.formatUnits(balance.toString(), 6));
});
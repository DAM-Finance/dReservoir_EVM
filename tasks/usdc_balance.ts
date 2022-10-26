import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc_balance", "gets the USDC balance for an account")
  .addParam("user", "The user's address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {read} = deployments;

	const result = await read(
		"USDC", 
		{from: taskArgs.user},
		"balanceOf",
		taskArgs.user
	);
	
	console.log(`User ${taskArgs.user.substring(0, 10)} USDC balance:`, ethers.utils.formatUnits(result.toString(), 6));
});
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("dprime_balance", "gets the USDC balance for an account")
  .addParam("user", "The user's address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {read} = deployments;

	const dPrimeOne = await read(
		"dPrimeOne", 
		{from: taskArgs.user},
		"balanceOf",
		taskArgs.user
	);

	console.log(`User ${taskArgs.user.substring(0, 10)} dPrimeOne balance:`, ethers.utils.formatEther(dPrimeOne));

	const dPrimeTwo = await read(
		"dPrimeTwo", 
		{from: taskArgs.user},
		"balanceOf",
		taskArgs.user
	);

	console.log(`User ${taskArgs.user.substring(0, 10)} dPrimeTwo balance:`, ethers.utils.formatEther(dPrimeTwo));
});
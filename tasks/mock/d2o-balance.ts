import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("d2o-balance", "gets the USDC balance for an account")
  .addParam("address", "The user's address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {read} = deployments;

	const d2OOne = await read(
		"d2oOne", 
		{from: taskArgs.address},
		"balanceOf",
		taskArgs.address
	);

	console.log(`User ${taskArgs.address} d2oOne balance:`, ethers.utils.formatEther(d2OOne));

	const d2OTwo = await read(
		"d2oTwo", 
		{from: taskArgs.address},
		"balanceOf",
		taskArgs.address
	);

	console.log(`User ${taskArgs.address} d2oTwo balance:`, ethers.utils.formatEther(d2OTwo));

	const d2OThree = await read(
		"d2oThree", 
		{from: taskArgs.address},
		"balanceOf",
		taskArgs.address
	);

	console.log(`User ${taskArgs.address} d2oThree balance:`, ethers.utils.formatEther(d2OThree));
});
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("d2o-balance", "gets the USDC balance for an account")
  .addParam("address", "The user's address")
  .addParam("env", "mock, test or main")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	switch (taskArgs.env) {
		case "mock":
			await mock(hre, taskArgs);
			return;
		case "test":
			await test(hre, taskArgs);
			return;
	}
});

async function mock(hre: HardhatRuntimeEnvironment, taskArgs) {
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
}

async function test(hre: HardhatRuntimeEnvironment, taskArgs) {
	const {deployments} = hre;
	const {read} = deployments;

	const d2o = await read(
		"d2o", 
		{from: taskArgs.address},
		"balanceOf",
		taskArgs.address
	);

	console.log(`User ${taskArgs.address} d2o balance:`, ethers.utils.formatEther(d2o));
}
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("d2O_balance", "gets the USDC balance for an account")
  .addParam("user", "The user's address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments} = hre;
	const {read} = deployments;
	const network = hre.network.name;

	switch (network) {
		case "localhost":
			const d2OOne = await read(
				"d2OOne", 
				{from: taskArgs.user},
				"balanceOf",
				taskArgs.user
			);
	
			console.log(`User ${taskArgs.user.substring(0, 10)} d2OOne balance:`, ethers.utils.formatEther(d2OOne));
	
			const d2OTwo = await read(
				"d2OTwo", 
				{from: taskArgs.user},
				"balanceOf",
				taskArgs.user
			);
	
			console.log(`User ${taskArgs.user.substring(0, 10)} d2OTwo balance:`, ethers.utils.formatEther(d2OTwo));
			break;
		case "goerli":
			let d2OGoerli = await read(
				"d2O", 
				{from: taskArgs.user},
				"balanceOf",
				taskArgs.user
			);
			console.log(`User ${taskArgs.user.substring(0, 10)} d2O balance:`, ethers.utils.formatEther(d2OGoerli));
			break;
		case "moonbase":
			let d2OMoonbase = await read(
				"d2O", 
				{from: taskArgs.user},
				"balanceOf",
				taskArgs.user
			);
			console.log(`User ${taskArgs.user.substring(0, 10)} d2O balance:`, ethers.utils.formatEther(d2OMoonbase));
			break;
		default:
			console.log(`Network ${network} not supported for task usdc_balance.`)
	}
});
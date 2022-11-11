import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("usdc_balance", "gets the USDC balance for an account")
  	.addParam("user", "The user's address")
  	.setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
		const network = hre.network.name;
		const {deployments} = hre;
		const {read} = deployments;
		let balance;

		switch (network) {
			case "localhost":
				balance = await read("USDC", {from: taskArgs.user}, "balanceOf", taskArgs.user);
				break;
			case "goerli":
				balance = await read("USDC", {from: taskArgs.user}, "balanceOf", taskArgs.user);
				break;
			default:
				console.log(`Network ${network} not supported for task usdc_balance.`)
		}
		
		console.log(`User ${taskArgs.user.substring(0, 10)} USDC balance:`, ethers.utils.formatUnits(balance.toString(), 6));
});
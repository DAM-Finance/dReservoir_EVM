import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

// Works for localhost and groeli.
task("eth_balance", "gets a user's ethereum balance")
	.addParam("user", "The user's address")
  	.setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
		const provider = hre.ethers.provider;
		const balance = ethers.utils.formatEther(await provider.getBalance(taskArgs.user));
		console.log(`User ${taskArgs.user.substring(0, 10)} ETH balance:`, balance);
});
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

// Works for localhost and groeli.
task("eth-balance", "gets a user's ethereum balance")
	.addParam("address", "The user's address")
  	.setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
		const provider = hre.ethers.provider;
		const balance = ethers.utils.formatEther(await provider.getBalance(taskArgs.address));
		console.log(`User ${taskArgs.address} ETH balance:`, balance);
});
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-get-remote-ism", "gets the USDC balance for an account")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	  const {read} = deployments;
    const {deployer} = await getNamedAccounts();

    const result = await read(
      "HyperlanePipe",
      {from: deployer},
		  "interchainSecurityModule"
    );

    console.log(result);
});
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-set-remote-ism", "gets the USDC balance for an account")
  .addParam("address", "The remote ISM Address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	  const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    await execute(
      "HyperlanePipe",
      {from: deployer, log: true},
		  "setInterchainSecurityModule",
		  taskArgs.address
    );
});
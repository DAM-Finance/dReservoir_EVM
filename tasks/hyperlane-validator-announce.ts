import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-validator-announce", "announce a new validator")
  .addParam("validatorAddress", "The validator address")
  .addParam("signature", "The validator signature over announce data")
  .addParam("storageLocation", "The validator storage location")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    await execute(
        "ValidatorAnnounce",
        {from: deployer, log: true},
		"announce",
		taskArgs.validatorAddress, taskArgs.storageLocation, taskArgs.signature
	);
});
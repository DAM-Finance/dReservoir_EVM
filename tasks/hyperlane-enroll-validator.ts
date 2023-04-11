import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";

task("hyperlane-enroll-validator", "gets the USDC balance for an account")
  .addParam("remoteDomainId", "The remote domain id")
  .addParam("remoteValidatorAddress", "The remote validator address")
  .addParam("threshold", "The remote signature threshold")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    await execute(
        "MultisigIsm",
        {from: deployer, log: true},
		"enrollValidators",
		[taskArgs.remoteDomainId], [[taskArgs.remoteValidatorAddress]]
	);

    await execute(
        "MultisigIsm",
        {from: deployer, log: true},
		"setThresholds",
		[taskArgs.remoteDomainId], [taskArgs.threshold]
	);
});
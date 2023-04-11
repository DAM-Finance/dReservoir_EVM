import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";

task("hyperlane-update-gas-oracle-data", "updates the prioce data for a specified gas oracle")
  .addParam("remoteId", "The remote desintation id")
  .addParam("address", "The gas oracle address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	  const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    const remoteId = taskArgs.remoteId;
    const address = taskArgs.address;

    await execute(
      "InterchainGasPaymaster",
      {from: deployer, log: true},
      "setGasOracles",
      [{remoteId, address}]
  );
});
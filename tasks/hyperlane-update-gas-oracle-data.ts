import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-update-gas-oracle-data", "sets the gas oracle address for a specific remote")
  .addParam("remoteId", "The remote desintation id")
  .addParam("exchangeRate", "The network to network exchange rate")
  .addParam("gasPrice", "The current gas price on the remote network")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	  const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    const remoteId = taskArgs.remoteId;
    const exchangeRate = ethers.utils.parseUnits(taskArgs.exchangeRate, 0);
    const gasPrice = ethers.utils.parseUnits(taskArgs.gasPrice, "gwei");

    console.log("remote id: ", remoteId);
    console.log("exchange rate: ", exchangeRate.toString());
    console.log("gas price: ", gasPrice.toString());

    await execute(
      "StorageGasOracle",
      {from: deployer, log: true},
      "setRemoteGasData",
      [remoteId, exchangeRate, gasPrice]  // May need to format this as a 2 dimensional array. Tuple is '[...]' in etherum's ABI spec.
  );
});
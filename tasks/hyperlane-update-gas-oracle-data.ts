import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-set-gas-oracle-address", "sets the gas oracle address for a specific remote")
  .addParam("remoteId", "The remote desintation id")
  .addParam("exchangeRate", "The network to network exchange rate")
  .addParam("gasPrice", "The current gas price on the remote network")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	  const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    const remoteId = taskArgs.remoteId;
    const exchangeRate = taskArgs.exchangeRate;
    const gasPrice = taskArgs.gasPrice;

  //   struct RemoteGasDataConfig {
  //     uint32 remoteDomain;
  //     uint128 tokenExchangeRate;
  //     uint128 gasPrice;
  //   }

    await execute(
      "StorageGasOracle",
      {from: deployer, log: true},
      "setRemoteGasData",
      [{remoteDomain: remoteId, tokenExchangeRate: exchangeRate, gasPrice: gasPrice}]  // May need to format this as a 2 dimensional array. Tuple is '[...]' in etherum's ABI spec.
  );
});
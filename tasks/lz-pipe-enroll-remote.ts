import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';
import 'dotenv/config';

task("lz-enroll-remote", "enrolls remote address for layer zero pipe")
  .addParam("remoteDomainId", "Chain id for remote pipe")
  .addParam("remotePipeAddress", "Chain address for remote pipe")
  .addParam("sourcePipeAddress", "source network's LZ Pipe address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    let trustedRemote = ethers.utils.solidityPack(
        ['address','address'],
        [taskArgs.remotePipeAddress, taskArgs.sourcePipeAddress]
    )

    await execute(
        "LayerZeroPipe",
        {from: deployer, log: true},
		"setTrustedRemoteAuth",
		taskArgs.remoteDomainId, trustedRemote
	);
});
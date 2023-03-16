import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-enroll-remote", "enrolls remote address for hyperlane pipe")
  .addParam("remoteDomainId", "The user's address")
  .addParam("remotePipeAddress", "The user's address")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    function byteify(address) {
        return ethers.utils.hexZeroPad(ethers.utils.hexlify(address), 32)
    }

    await execute(
        "HyperlanePipe",
        {from: deployer, log: true},
		"enrollRemoteRouter",
		taskArgs.remoteDomainId, byteify(taskArgs.remotePipeAddress)
	);

    // TODO: Also need to enroll remote validators on the ISM contract. Ie.. network two ISM (deployed by network one) needs to enroll network one validator.
    // Also need to set threholds
});
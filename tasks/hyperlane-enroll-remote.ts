import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-enroll-remote", "gets the USDC balance for an account")
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
});
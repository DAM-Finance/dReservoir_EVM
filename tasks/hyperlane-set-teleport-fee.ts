import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("hyperlane-set-teleport-fee", "gets the USDC balance for an account")
  .addParam("fee", "fee in percentage points")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;
    const {deployer} = await getNamedAccounts();

    function fray(ray) { 
        return ethers.utils.parseEther(ray).mul("1000000000");
    }

    await execute(
        "HyperlanePipe",
        {from: deployer, log: true},
		"setTeleportFee",
		fray(taskArgs.fee)
	);

});
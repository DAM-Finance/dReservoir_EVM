import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ethers } from 'ethers';

const deployHyperlaneMailbox: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

    const ISM = await deploy("MultisigIsm", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const ISMAddress = ISM.receipt?.contractAddress;

    await execute(
        "HyperlanePipe",
        {from: deployer, log: true},
		"setInterchainSecurityModule",
		ISMAddress
    );

	console.log("✅ Hyperlane libraries and setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-ism"];
module.exports.dependencies = [];
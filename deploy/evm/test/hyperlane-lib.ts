import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ethers } from 'ethers';

const deployHyperlaneMailbox: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	const mailboxDomainId: string | undefined = process.env["MAILBOX_DOMAIN_ID"];
	if (!mailboxDomainId) {
		throw new Error("Please set MAILBOX_DOMAIN_ID");
	}

    const IGP = await deploy("InterchainGasPaymaster", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                methodName: "initialize",
                args: []
            }
        }
    });

    const ISM = await deploy("MultisigIsm", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const ISMAddress = ISM.receipt?.contractAddress;

    const Mailbox = await deploy("Mailbox", {
        from: deployer,
        args: [mailboxDomainId],
        log: true,
        autoMine: true,
        proxy: {
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
                methodName: "initialize",
                args: [deployer, ISMAddress]
            }
        }
    });

	console.log("✅ Hyperlane libraries and setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-lib"];
module.exports.dependencies = [];
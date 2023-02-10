import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployHyperlaneMailbox: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute, read} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	const mailboxDomainId: string | undefined = process.env["MAILBOX_DOMAIN_ID"];
	if (!mailboxDomainId) {
		throw new Error("Please set MAILBOX_DOMAIN_ID");
	}

	await deploy("ProxyAdmin", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    await deploy("InterchainGasPaymaster", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    await deploy("Mailbox", {
        from: deployer,
        args: [mailboxDomainId],
        log: true,
        autoMine: true
    });

	console.log("✅ Hyperlane libraries and setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-lib"];
module.exports.dependencies = [];
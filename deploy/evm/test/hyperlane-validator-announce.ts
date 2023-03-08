import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ethers } from 'ethers';

const deployHyperlaneMailbox: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;
	const {deployer} = await getNamedAccounts();

	let mailboxAddress: string | undefined;

    try {
		const Mailbox = await deployments.get("Mailbox");
		mailboxAddress = Mailbox.address;
	} catch (e) {
		mailboxAddress = process.env["MAILBOX_ADDRESS"];
		if (!mailboxAddress) {
			throw new Error("Please set MAILBOX_ADDRESS");
		}
	}

    const ValidatorAnnounce = await deploy("ValidatorAnnounce", {
        from: deployer,
        args: [mailboxAddress],
        log: true,
        autoMine: true
    });


	console.log("✅ Validator announce setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-validator-announce"];
module.exports.dependencies = [];
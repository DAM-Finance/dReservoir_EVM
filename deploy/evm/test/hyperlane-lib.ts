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

	// await deploy("ProxyAdmin", {
    //     from: deployer,
    //     args: [],
    //     log: true,
    //     autoMine: true
    // });

    const IGP = await deploy("InterchainGasPaymaster", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const IGPAddress        = IGP.receipt?.contractAddress;
    // let initInterfaceIGP    = new ethers.utils.Interface(["function initialize()"]);
    // let initDataIGP         = initInterfaceIGP.encodeFunctionData("initialize", []);  

    // await deploy("IGPProxy", {
    //     from: treasury,
    //     args: [IGPAddress, treasury, initDataIGP],
    //     log: true,
    //     autoMine: true,
    //     contract: "TransparentUpgradeableProxy"
    // });

    const ISM = await deploy("MultisigIsm", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const Mailbox = await deploy("Mailbox", {
        from: deployer,
        args: [mailboxDomainId],
        log: true,
        autoMine: true
    });

    const mailboxAddress        = Mailbox.receipt?.contractAddress;
    const ISMAddress            = ISM.receipt?.contractAddress;
    // let initInterfaceMailbox    = new ethers.utils.Interface(["function initialize(address, address)"]);
    // let initDataMailbox         = initInterfaceMailbox.encodeFunctionData("initialize", [deployer, ISMAddress]);  

    // // Proxy admin/deployer needs to be different address to implementation deployer/address.
    // await deploy("MailboxProxy", {
    //     from: treasury,
    //     args: [mailboxAddress, treasury, initDataMailbox],      
    //     log: true,
    //     autoMine: true,
    //     contract: "TransparentUpgradeableProxy"
    // });

    await execute(
        "Mailbox",
        {from: deployer, log: true},
		"initialize",
		deployer, ISMAddress
    );

	console.log("✅ Hyperlane libraries and setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-lib"];
module.exports.dependencies = [];
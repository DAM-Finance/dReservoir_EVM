import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployHyperlanePipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute, read} = deployments;
	const {deployer, treasury} = await getNamedAccounts();
	
	const d2o = await deployments.get("d2o");

	let mailboxAddress: string | undefined
	let icgpAddress: string | undefined

	// If we deployed the Mailbox and ICGP as part of the deployment process then hardhat will know the addresses.
	// Otherwise, if not, then this script expects us to set envars for the contract addresses.

	try {
		const Mailbox = await deployments.get("Mailbox_Proxy");
		mailboxAddress = Mailbox.address;
	} catch (e) {
		mailboxAddress = process.env["MAILBOX_ADDRESS"];
		if (!mailboxAddress) {
			throw new Error("Please set MAILBOX_ADDRESS");
		}
	}

	try {
		const ICGP = await deployments.get("InterchainGasPaymaster_Proxy");
		icgpAddress = ICGP.address;
	} catch (e) {
		icgpAddress = process.env["ICGP_ADDRESS"];
		if (!icgpAddress) {
			throw new Error("Please set ICGP_ADDRESS");
		}
	}

	// Deploy the pipes.

	const hyperlanePipe = await deploy("HyperlanePipe", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

	const hyperlanePipeAddress = hyperlanePipe.receipt?.contractAddress;

	await execute(
		"d2o",
		{from: deployer, log: true},
		"rely",
		hyperlanePipeAddress
	)

	await execute(
		"HyperlanePipe",
		{from: deployer, log: true},
		"initialize",
		mailboxAddress, icgpAddress, d2o.address, 10000, treasury
	);

	console.log("✅ Hyperlane deployment and setup successful.")
};

module.exports = deployHyperlanePipe;
module.exports.tags = ["hyperlane-pipe"];
module.exports.dependencies = [];
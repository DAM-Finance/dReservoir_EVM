import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployHyperlanePipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute, read} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	const mailboxAddress: string | undefined = process.env["MAILBOX_ADDRESS"];
	if (!mailboxAddress) {
		throw new Error("Please set MAILBOX_ADDRESS");
	}

	const interchainGasPaymasterAddress: string | undefined = process.env["INTERCHAIN_GAS_PAYMASTER_ADDRESS"];
	if (!interchainGasPaymasterAddress) {
		throw new Error("Please set INTERCHAIN_GAS_PAYMASTER_ADDRESS");
	}

	const d2o = await deployments.get("d2o");

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
		mailboxAddress, interchainGasPaymasterAddress, d2o.address, 10000, treasury
	);

	console.log("✅ Hyperlane deployment and setup successful.")
};

module.exports = deployHyperlanePipe;
module.exports.tags = ["hyperlane-pipe"];
module.exports.dependencies = ["d2o"];
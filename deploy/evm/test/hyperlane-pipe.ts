import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployHyperlanePipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute, read} = deployments;
	const {deployer, treasury} = await getNamedAccounts();
	
	const d2o = await deployments.get("d2o");
	const Mailbox = await deployments.get("Mailbox");
	const ICGP = await deployments.get("InterchainGasPaymaster");

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
		Mailbox.address, ICGP.address, d2o.address, 10000, treasury
	);

	console.log("✅ Hyperlane deployment and setup successful.")
};

module.exports = deployHyperlanePipe;
module.exports.tags = ["hyperlane-pipe"];
module.exports.dependencies = ["hyperlane-lib", "d2o"];
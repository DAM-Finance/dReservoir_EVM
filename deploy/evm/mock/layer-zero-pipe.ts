import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployLayerZeroPipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	const chainIdOne 	= 1;
	const chainIdTwo 	= 2;
	const d2oOne 		= await deployments.get("d2oOne");
	const d2oTwo 		= await deployments.get("d2oTwo");

	// Deploy the mock endpoints.

	const layerZeroEndpointOne = await deploy("LayerZeroEndpointOne", {
        from: deployer,
        args: [chainIdOne],
        log: true,
        autoMine: true,
        contract: "LZEndpointMock"
    });

	const layerZeroEndpointTwo = await deploy("LayerZeroEndpointTwo", {
        from: deployer,
        args: [chainIdTwo],
        log: true,
        autoMine: true,
        contract: "LZEndpointMock"
    });

	// Deploy the pipes.

	const layerZeroPipeOne = await deploy("LayerZeroPipeOne", {
		from: deployer,
		args: [layerZeroEndpointOne.address, d2oOne.address, treasury],
		log: true,
		autoMine: true,
		contract: "LayerZeroPipe"
	});

	const layerZeroPipeTwo = await deploy("LayerZeroPipeTwo", {
		from: deployer,
		args: [layerZeroEndpointTwo.address, d2oTwo.address, treasury],
		log: true,
		autoMine: true,
		contract: "LayerZeroPipe"
	});

	const layerZeroEndpointOneAddress 	= layerZeroEndpointOne.receipt?.contractAddress;
	const layerZeroEndpointTwoAddress 	= layerZeroEndpointTwo.receipt?.contractAddress;
	const layerZeroPipeOneAddress 		= layerZeroPipeOne.receipt?.contractAddress;
	const layerZeroPipeTwoAddress 		= layerZeroPipeTwo.receipt?.contractAddress;

	// Permission pipe contracts to mint and burn d2o.

	await execute(
		"d2oOne",
		{from: deployer, log: true},
		"rely",
		layerZeroPipeOneAddress
	)

	await execute(
		"d2oTwo",
		{from: deployer, log: true},
		"rely",
		layerZeroPipeTwoAddress
	)

	// Set up the mock endpoints.

	await execute(
		"LayerZeroEndpointOne",
		{from: deployer, log: true},
		"setDestLzEndpoint",
		layerZeroPipeTwoAddress, layerZeroEndpointTwoAddress
	)

	await execute(
		"LayerZeroEndpointTwo",
		{from: deployer, log: true},
		"setDestLzEndpoint",
		layerZeroPipeOneAddress, layerZeroEndpointOneAddress
	)

	// Register the pipes with each other.

	await execute(
		"LayerZeroPipeOne",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdTwo, layerZeroPipeTwoAddress
	)

	await execute(
		"LayerZeroPipeTwo",
		{from: deployer, log: true},
		"setTrustedRemoteAddress",
		chainIdOne, layerZeroPipeOneAddress
	)

	console.log("✅ Layer Zero deployment successful.")
};

module.exports = deployLayerZeroPipe;
module.exports.tags = ["layer-zero-pipe", "mock"];
module.exports.dependencies = ["d2o"];
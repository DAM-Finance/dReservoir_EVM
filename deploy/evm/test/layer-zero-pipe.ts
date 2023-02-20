import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployLayerZeroPipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer} = await getNamedAccounts();

	const layerZeroEndpointAddress: string | undefined = process.env['LAYER_ZERO_ENDPOINT'];
	if (!layerZeroEndpointAddress) {
		throw new Error("Please set LAYER_ZERO_ENDPOINT");
	}

	const treasuryAddress: string | undefined = process.env['TREASURY_ADDRESS'];
	if (!treasuryAddress) {
		throw new Error("Please set TREASURY_ADDRESS");
	}

	const d2o = await deployments.get("d2o");

	const layerZeroPipe = await deploy("LayerZeroPipe", {
		from: deployer,
		args: [layerZeroEndpointAddress, d2o.address, treasuryAddress],
		log: true,
		autoMine: true
	});

	const layerZeroPipeAddress = layerZeroPipe.receipt?.contractAddress;

	await execute(
		"d2o",
		{from: deployer, log: true},
		"rely",
		layerZeroPipeAddress
	)

	console.log("✅ Layer Zero deployment and setup successful.")
};

module.exports = deployLayerZeroPipe;
module.exports.tags = ["layer-zero-pipe"];
module.exports.dependencies = [];
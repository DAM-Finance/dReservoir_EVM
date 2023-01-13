import 'dotenv/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const {deployer, treasury} = await getNamedAccounts();

	// ----------
	// Layer Zero
	// ----------

	// LayerZero End-Point address.
	const layerZeroEndpointMoonbeamAddress = process.env['LAYER_ZERO_ENDPOINT_MOONBEAM'];
	if (!layerZeroEndpointMoonbeamAddress) {
		throw new Error("Please set LAYER_ZERO_ENDPOINT_MOONBASE in a .env file");
	}

	// ------
	// d2O
	// ------

	// d2O

	const d2O = await deploy('d2O', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const d2OAddress = d2O.receipt?.contractAddress;

	// Layer Zero

	const LZPipe = await deploy('LayerZeroPipe', {
		from: deployer,
		args: [layerZeroEndpointMoonbeamAddress, d2OAddress],
		log: true,
		autoMine: true
	});

	const LZPipeAddress = LZPipe.receipt?.contractAddress;

	console.log("✅ Deployment successful.")
};
export default func;
func.tags = ['LMCV'];

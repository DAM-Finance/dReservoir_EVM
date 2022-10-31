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
	const layerZeroEndpointAddress = process.env['LAYER_ZERO_ENDPOINT_MOONBASE'];
	if (!layerZeroEndpointAddress) {
		throw new Error("Please set LAYER_ZERO_ENDPOINT_MOONBASE in a .env file");
	}

	// ------
	// dPRIME
	// ------

	// dPrime

	const dPrime = await deploy('dPrime', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const dPrimeAddress = dPrime.receipt?.contractAddress;

	// Layer Zero

	const LZPipe = await deploy('dPrimeConnectorLZ', {		
		from: deployer,
		args: [layerZeroEndpointAddress, dPrimeAddress],
		log: true,
		autoMine: true
	});

	const LZPipeAddress = LZPipe.receipt?.contractAddress;

	// Hyperlane

	const HyperlanePipe = await deploy('dPrimeConnectorHyperlane', {		
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const HyperlanePipeAddress = HyperlanePipe.receipt?.contractAddress;

	console.log("✅ Deployment successful.")
};
export default func;
func.tags = ['LMCV'];

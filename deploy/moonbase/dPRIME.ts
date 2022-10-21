import 'dotenv/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const {deployer, treasury} = await getNamedAccounts();

	// ----------
	// Layer Zero
	// ----------

	// LayerZero End-Point address.
	const layerZeroEndpointAddress = process.env['LAYER_ZERO_ENDPOINT_MOONBASE'];

	// ------
	// dPRIME
	// ------

	// dPrime

	const dPrime = await deploy('dPrime', {
		from: deployer,
		args: [layerZeroEndpointAddress],
		log: true,
		autoMine: true
	});
};
export default func;
func.tags = ['LMCV'];

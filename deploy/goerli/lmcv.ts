import 'dotenv/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';	

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const {deployer, treasury} = await getNamedAccounts();

	// ------
	// Tokens
	// ------

	// USDC address.
	const usdcAddress = process.env['USDC_ADDRESS_GOERLI'];
	const usdcBytes = ethers.utils.formatBytes32String("PSM-USDC");

	// ----------
	// Layer Zero
	// ----------

	// LayerZero End-Point address.
	const layerZeroEndpointAddress = process.env['LAYER_ZERO_ENDPOINT_GOERLI'];

	// ----
	// LMCV
	// ----

	// LMCV

	const lmcv = await deploy('LMCV', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});
	
	const lmcvAddress = lmcv.receipt?.contractAddress;

	// LMCV Proxy

	const lmcvProxy = await deploy('LMCVProxy', {
		from: deployer,
		args: [lmcvAddress],
		log: true,
		autoMine: true
	});

	const lmcvProxyAddress = lmcvProxy.receipt?.contractAddress;

	// dPrime

	const dPrime = await deploy('dPrime', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const dPrimeAddress = dPrime.receipt?.contractAddress;

	// dPRIME Join

	const dPrimeJoin = await deploy('dPrimeJoin', {
		from: deployer,
		args: [lmcvAddress, dPrimeAddress, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const dPrimeJoinAddress = dPrimeJoin.receipt?.contractAddress;

	// USDC Join

	const usdcJoin = await deploy('CollateralJoinDecimals', {		
		from: deployer,
		args: [lmcvAddress, lmcvProxyAddress, usdcBytes, usdcAddress],
		log: true,
		autoMine: true
	});

	const usdcJoinAddress = usdcJoin.receipt?.contractAddress;


	// USDC PSM

	const usdcPsm = await deploy('PSM', {		
		from: deployer,
		args: [usdcJoinAddress, dPrimeJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	const usdcPSMAddress = usdcPsm.receipt?.contractAddress;

	// LZ PIPE

	const LZPipe = await deploy('dPrimeConnectorLZ', {		
		from: deployer,
		args: [layerZeroEndpointAddress, dPrimeAddress],
		log: true,
		autoMine: true
	});

	const LZPipeAddress = LZPipe.receipt?.contractAddress;

	// HYPERLANE PIPE

	const HyperlanePipe = await deploy('dPrimeConnectorHyperlane', {		
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const HyperlanePipeAddress = HyperlanePipe.receipt?.contractAddress;
};
export default func;
func.tags = ['LMCV'];

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	// LayerZero End-Point address.
	const layerZeroEndpointEthereumAddress: string | undefined = process.env['LAYER_ZERO_ENDPOINT_ETHEREUM'];
	if (!layerZeroEndpointEthereumAddress) {
		throw new Error("Please set LAYER_ZERO_ENDPOINT_ETHEREUM in a .env file");
	}

	// USDC PSM Bytes.
	const usdcPsmSymbol: string | undefined = process.env['USDC_PSM_SYMBOL'];
	if (!usdcPsmSymbol) {
		throw new Error("Please set USDC_PSM_SYMBOL in a .env file");
	}
	const usdcPsmBytes = ethers.utils.formatBytes32String(usdcPsmSymbol);

	// USDC contract address.
	const usdcAddressEthereum: string | undefined = process.env['USDC_ADDRESS_ETHEREUM'];
	if (!usdcAddressEthereum) {
		throw new Error("Please set USDC_ADDRESS_ETHEREUM in a .env file");
	}

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

	// d2O

	const d2O = await deploy('d2O', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const d2OAddress = d2O.receipt?.contractAddress;

	// d2O connector layer-zero

	const LayerZeroPipe = await deploy('LayerZeroPipe', {
		from: deployer,
		args: [layerZeroEndpointEthereumAddress, d2OAddress],
		log: true,
		autoMine: true,
		contract: "LayerZeroPipe"
	});

	const LayerZeroPipeAddress = LayerZeroPipe.receipt?.contractAddress;

	// d2O Join.

	const d2OJoin = await deploy('d2OJoin', {
		from: deployer,
		args: [lmcvAddress, d2OAddress, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const d2OJoinAddress = d2OJoin.receipt?.contractAddress;

	// USDC Join

	const usdcJoin = await deploy('usdcJoin', {		
		from: deployer,
		args: [lmcvAddress, lmcvProxyAddress, usdcPsmBytes, usdcAddressEthereum],
		log: true,
		autoMine: true,
		contract: "CollateralJoinDecimals"
	});

	const usdcJoinAddress = usdcJoin.receipt?.contractAddress;


	// USDC PSM

	const usdcPsm = await deploy('PSM', {		
		from: deployer,
		args: [usdcJoinAddress, d2OJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	const usdcPsmAddress = usdcPsm.receipt?.contractAddress;

	console.log("✅ Deployment successful.")
};

export default func;
func.tags = ['LMCV'];

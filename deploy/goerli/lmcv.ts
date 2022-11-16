import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;
	const {deployer, treasury, user} = await getNamedAccounts();

	// LayerZero End-Point address.
	const layerZeroEndpointAddress: string | undefined = process.env['LAYER_ZERO_ENDPOINT_GOERLI'];
	if (!layerZeroEndpointAddress) {
		throw new Error("Please set LAYER_ZERO_ENDPOINT_GOERLI in a .env file");
	}

	// USDC PSM Bytes.
	const usdcPsmSymbol: string | undefined = process.env['USDC_PSM_SYMBOL'];
	if (!usdcPsmSymbol) {
		throw new Error("Please set USDC_PSM_SYMBOL in a .env file");
	}
	const usdcPsmBytes = ethers.utils.formatBytes32String(usdcPsmSymbol);

	// ----------
	// Collateral
	// ----------

	let usdcName 	= ethers.utils.formatBytes32String("USD Coin");
	let usdcSymbol 	= ethers.utils.formatBytes32String("USDC");

	const usdc = await deploy('USDC', {
		from: deployer,
		args: [usdcName, usdcSymbol],
		log: true,
		autoMine: true,
		contract: "TestERC20"
	});

	const usdcAddress = usdc.receipt?.contractAddress;

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
		args: [layerZeroEndpointAddress, d2OAddress],
		log: true,
		autoMine: true,
		contract: "d2OConnectorLZ"
	});

	const LayerZeroPipeAddress = LayerZeroPipe.receipt?.contractAddress;

	// d2O connector hyperlane

	const HyperlanePipe = await deploy('HyperlanePipe', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const HyperlanePipeAddress = HyperlanePipe.receipt?.contractAddress;

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
		args: [lmcvAddress, lmcvProxyAddress, usdcPsmBytes, usdcAddress],
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

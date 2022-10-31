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

	// dPrime

	const dPrime = await deploy('dPrime', {
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const dPrimeAddress = dPrime.receipt?.contractAddress;

	// dPrime connector layer-zero

	const dPrimeConnectorLZ = await deploy('dPrimeConnectorLZ', {
		from: deployer,
		args: [layerZeroEndpointAddress, dPrimeAddress],
		log: true,
		autoMine: true,
		contract: "dPrimeConnectorLZ"
	});

	const dPrimeConnectorLZAddress = dPrimeConnectorLZ.receipt?.contractAddress;

	// dPrime connector hyperlane

	const dPrimeConnectorHyperlane = await deploy('dPrimeConnectorHyperlane', {		
		from: deployer,
		args: [],
		log: true,
		autoMine: true
	});

	const dPrimeConnectorHyperlaneAddress = dPrimeConnectorHyperlane.receipt?.contractAddress;

	// dPrime Join.

	const dPrimeJoin = await deploy('dPrimeJoin', {
		from: deployer,
		args: [lmcvAddress, dPrimeAddress, lmcvProxyAddress],
		log: true,
		autoMine: true
	});

	const dPrimeJoinAddress = dPrimeJoin.receipt?.contractAddress;

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
		args: [usdcJoinAddress, dPrimeJoinAddress, treasury],
		log: true,
		autoMine: true
	});

	const usdcPsmAddress = usdcPsm.receipt?.contractAddress;

	console.log("✅ Deployment successful.")
};

export default func;
func.tags = ['LMCV'];

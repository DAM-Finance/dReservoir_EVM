import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ethers } from 'ethers';

const deployHyperlaneMailbox: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

    const gnosisVaultAddress: string | undefined = process.env["GNOSIS_VAULT_ADDRESS"];
	if (!gnosisVaultAddress) {
		throw new Error("Please set GNOSIS_VAULT_ADDRESS");
	}

    const ICGP = await deploy("InterchainGasPaymaster", {
        from: deployer,
        args: [gnosisVaultAddress, gnosisVaultAddress],
        log: true,
        autoMine: true
    });

    const ICGPAddress = ICGP.receipt?.contractAddress;

    await execute(
        "HyperlanePipe",
        {from: deployer, log: true},
		"setInterchainGasPaymaster",
		ICGPAddress
    );

    const StorageGasOracle = await deploy("StorageGasOracle", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const StorageGasOracleAddress = StorageGasOracle.receipt?.contractAddress;

	console.log("✅ Hyperlane ICGP and storage gas oracle setup successful.")
};

module.exports = deployHyperlaneMailbox;
module.exports.tags = ["hyperlane-icgp"];
module.exports.dependencies = [];
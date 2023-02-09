import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployD2o: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    const d2o = await deploy("d2o", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true
    });

    const d2oAddress = d2o.receipt?.contractAddress;

    await deploy("d2oGuardian", {
        from: deployer,
        args: [d2oAddress],
        log: true,
        autoMine: true,
    });

    console.log("✅ d2o deployment successful.")
};

module.exports = deployD2o;
module.exports.tags = ["d2o"];
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployD2o: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    // Main network d2o associated with the LMCV.

    const d2oOne = await deploy("d2oOne", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        contract: "d2o"
    });

    const d2oAddressOne = d2oOne.receipt?.contractAddress;

    await deploy("d2oGuardianOne", {
        from: deployer,
        args: [d2oAddressOne],
        log: true,
        autoMine: true,
        contract: "d2oGuardian"
    });

    // Layer Zero d2o.
    
    const d2oTwo = await deploy("d2oTwo", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        contract: "d2o"
    });

    const d2oTwoAddress = d2oTwo.receipt?.contractAddress;

    await deploy("d2oGuardianTwo", {
        from: deployer,
        args: [d2oTwoAddress],
        log: true,
        autoMine: true,
        contract: "d2oGuardian"
    });

    // Hyperlane d2o.

    const d2oThree = await deploy("d2oThree", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        contract: "d2o"
    });

    const d2oThreeAddress = d2oThree.receipt?.contractAddress;

    await deploy("d2oGuardianThree", {
        from: deployer,
        args: [d2oThreeAddress],
        log: true,
        autoMine: true,
        contract: "d2oGuardian"
    });

    console.log("✅ d2o deployment successful.")
};

module.exports = deployD2o;
module.exports.tags = ["d2o", "mock"];
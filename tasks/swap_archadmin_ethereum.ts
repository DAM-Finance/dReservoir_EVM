import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";

task("swap_archadmin_ethereum", "Swaps ArchAdmin from deploying address to DAM Safe")
    .addParam("safe", "The Gnosis safe address to transfer admin to", "")
    .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {

        async function transaction(contractName: string, methodName: string, ...params) {
            try {
                console.log(`${contractName}:${methodName}()`);
                const result = await execute(
                    contractName,
                    {from: deployer, log: true},
                    methodName,
                    ...params
                )
                console.log("Transaction successful: ", result.transactionHash);
            } catch (e) {
                console.log(e);
            }
        }
        
        const {deployments, getNamedAccounts} = hre;
	    const {execute} = deployments;
	    const {deployer, treasury, user} = await getNamedAccounts();

        const deployedContracts = await deployments.all();
        const gnosisAddress = taskArgs.safe;

        if (gnosisAddress == "") {
            throw new Error("safe-address must be set to a valid ethereum address.")
        }

        console.log(gnosisAddress);
        
        // ----
        // LMCV
        // ----

        await transaction(
            "LMCV", 
            "administrate", 
            gnosisAddress, 1
        );

        await transaction(
            "LMCV", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "LMCV", 
            "administrate", 
            deployer, 0
        );

        // ---
        // d2O
        // ---

        await transaction(
            "d2O", 
            "rely", 
            gnosisAddress
        );

        await transaction(
            "d2O", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "d2O", 
            "deny", 
            deployer
        );

        // ---------
        // LMCVProxy
        // ---------

        await transaction(
            "LMCVProxy", 
            "rely", 
            gnosisAddress
        );

        await transaction(
            "LMCVProxy", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "LMCVProxy", 
            "deny", 
            deployer
        );

        // --------
        // USDCJoin
        // --------

        await transaction(
            "usdcJoin", 
            "rely", 
            gnosisAddress
        );

        await transaction(
            "usdcJoin", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "usdcJoin", 
            "deny", 
            deployer
        );

        // ---
        // PSM
        // ---
    
        await transaction(
            "PSM", 
            "rely", 
            gnosisAddress
        );

        await transaction(
            "PSM", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "PSM", 
            "deny", 
            deployer
        );

        // -------------
        // LayerZeroPipe
        // -------------

        await transaction(
            "LayerZeroPipe", 
            "rely", 
            gnosisAddress
        );

        await transaction(
            "LayerZeroPipe", 
            "setArchAdmin", 
            gnosisAddress
        );

        await transaction(
            "LayerZeroPipe", 
            "transferOwnership", 
            gnosisAddress
        );

        await transaction(
            "LayerZeroPipe", 
            "deny", 
            deployer
        );
    });
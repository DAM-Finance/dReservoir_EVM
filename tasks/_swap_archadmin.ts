import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';
import { Console } from 'console';

function fwad(wad: string) { return ethers.utils.parseEther(wad) }
function fray(ray: string) { return ethers.utils.parseEther(ray).mul("1000000000") }
function frad(rad: string) { return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") }

task("swap_archadmin", "Swaps ArchAdmin from deploying address to DAM Safe")
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

        let network = "";

        if (hre.network.name == "goerli") {
            network = "_GOERLI";
        }else if(hre.network.name == "moonbase") {
            network = "_MOONBASE";
        }else if(hre.network.name == "localhost") {
            console.log("Testing Local");
            network = "_LOCAL";
        }else{
            console.error("Error: Must be run with --network set to goerli or moonbase.");
            process.exit(1);
        }

        if(network == "_LOCAL"){

            const lmcvAddr: string | undefined            = process.env['LMCV' + network];
            const d2OAddr: string | undefined             = process.env['D2O' + network];
            const psmAddr: string | undefined             = process.env['PSM_USDC' + network];
            const lzPipeAddr: string | undefined          = process.env['LZPIPE' + network];
            const hyperlanePipeAddr: string | undefined   = process.env['HYPERLANEPIPE' + network];

            if(!lmcvAddr)           { throw new Error("Please set LMCV" +network+ " in a .env file");}
            if(!d2OAddr)            { throw new Error("Please set D2O" +network+ " in a .env file");}
            if(!psmAddr)            { throw new Error("Please set PSM_USDC" +network+ " in a .env file");}
            if(!lzPipeAddr)         { throw new Error("Please set LZPIPE" +network+ " in a .env file");}
            if(!hyperlanePipeAddr)  { throw new Error("Please set HYPERLANEPIPE" +network+ " in a .env file");}

            console.log("Success");


            // ---------------------------
            // Swap LMCV ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LMCV", 
                "administrate", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f", 1
            );

            await transaction(
                "LMCV", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LMCV", 
                "administrate", 
                deployer, 0
            );

            // ---------------------------
            // Swap D2O ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "d2O_One", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O_One", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O_One", 
                "deny", 
                deployer
            );

            // // ---------------------------
            // // Swap PSM ArchAdmin and remove admin
            // // ---------------------------
    
            await transaction(
                "PSM", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "PSM", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "PSM", 
                "deny", 
                deployer
            );

            // ---------------------------
            // Swap LZPipe ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LZPipeOne", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LZPipeOne", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LZPipeOne", 
                "deny", 
                deployer
            );

            await transaction(
                "LZPipeOne", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            // ---------------------------
            // Swap LZPipe2 ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LZPipeTwo", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LZPipeTwo", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LZPipeTwo",
                "deny",
                deployer
            );

            await transaction(
                "LZPipeTwo", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

        }else if(network == "_GOERLI"){

            const lmcvAddr: string | undefined            = process.env['LMCV' + network];
            const d2OAddr: string | undefined             = process.env['D2O' + network];
            const psmAddr: string | undefined             = process.env['PSM_USDC' + network];
            const lzPipeAddr: string | undefined          = process.env['LZPIPE' + network];
            const hyperlanePipeAddr: string | undefined   = process.env['HYPERLANEPIPE' + network];
    
            if(!lmcvAddr)           { throw new Error("Please set LMCV" +network+ " in a .env file");}
            if(!d2OAddr)            { throw new Error("Please set D2O" +network+ " in a .env file");}
            if(!psmAddr)            { throw new Error("Please set PSM_USDC" +network+ " in a .env file");}
            if(!lzPipeAddr)         { throw new Error("Please set LZPIPE" +network+ " in a .env file");}
            if(!hyperlanePipeAddr)  { throw new Error("Please set HYPERLANEPIPE" +network+ " in a .env file");}


            // ---------------------------
            // Swap LMCV ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LMCV", 
                "administrate", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f", 1
            );

            await transaction(
                "LMCV", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LMCV", 
                "administrate", 
                deployer, 0
            );

            // ---------------------------
            // Swap D2O ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "d2O", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O", 
                "deny", 
                deployer
            );

            // // ---------------------------
            // // Swap PSM ArchAdmin and remove admin
            // // ---------------------------
    
            await transaction(
                "PSM", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "PSM", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "PSM", 
                "deny", 
                deployer
            );

            // ---------------------------
            // Swap LZPipe ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LayerZeroPipe", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "deny", 
                deployer
            );

            // ---------------------------
            // Swap HyperlanePipe ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "HyperlanePipe", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe",
                "deny",
                deployer
            );
    
        }else if(network == "_MOONBASE"){

            const d2OAddr: string | undefined             = process.env['D2O' + network];
            const lzPipeAddr: string | undefined          = process.env['LZPIPE' + network];
            const hyperlanePipeAddr: string | undefined   = process.env['HYPERLANEPIPE' + network];

            if(!d2OAddr)            { throw new Error("Please set D2O" +network+ " in a .env file");}
            if(!lzPipeAddr)         { throw new Error("Please set LZPIPE" +network+ " in a .env file");}
            if(!hyperlanePipeAddr)  { throw new Error("Please set HYPERLANEPIPE" +network+ " in a .env file");}


            // ---------------------------
            // Swap D2O ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "d2O", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "d2O", 
                "deny", 
                deployer
            );

            // ---------------------------
            // Swap LZPipe ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "LayerZeroPipe", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "LayerZeroPipe", 
                "deny", 
                deployer
            );

            // ---------------------------
            // Swap HyperlanePipe ArchAdmin and remove admin
            // ---------------------------
    
            await transaction(
                "HyperlanePipe", 
                "rely", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe", 
                "setArchAdmin", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe", 
                "transferOwnership", 
                "0xf1f0BC990290543a8e9D0EC719CAECBC07792c9f"
            );

            await transaction(
                "HyperlanePipe",
                "deny",
                deployer
            );

        }

        

        

        


    });
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

task("do-all", "gets the USDC balance for an account")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	// Setup Hyperlane.
	// await hre.run("hyperlane-enroll-remote", {remoteDomainId: "", remotePipeAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"});
	// await hre.run("hyperlane-enroll-remote", {domainId: "", remotePipeAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"});

	// Mint d2o and do teleport.
	await hre.run("usdc-mint", {amount: "10000", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"});
	await hre.run("d2o-swap", {amount: "5000", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"});
	await hre.run("d2o-burn", {amount: "2500", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", env: "test"});
	// await hre.run("d2o-teleport-hyperlane", {amount: "1000", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", env: "test", source: "13371", dest: "13372"});
});

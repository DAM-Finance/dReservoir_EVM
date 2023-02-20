import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from "hardhat/config";
import { ethers } from 'ethers';

let usdcBytes = ethers.utils.formatBytes32String("PSM-USDC");	

function frad(rad: string) { 
	return ethers.utils.parseEther(rad).mul("1000000000000000000000000000") 
}

task("d2o-burn", "burns d2o for USDC")
  .addParam("amount", "The amount of d2O to burn")
  .addParam("address", "The user's address")
  .addParam("env", "mock, test or main")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {execute} = deployments;

	const d2oName = taskArgs.env == "mock" ? "d2oOne" : "d2o";

	// Provide approval.

	console.log("Approving d2oJoin...");

	const PSM = await deployments.get("PSM");

	const approveResult = await execute(
		d2oName, 
		{from: taskArgs.address, log: true},
		"approve",
		PSM.address, frad(taskArgs.amount)	// USDC has 6 decimal places.
	);

	console.log("Approve successful: ", approveResult.transactionHash);

	// Execute PSM swap.

	console.log(`Burning ${taskArgs.amount} of d2o for ${taskArgs.amount} USDC...`);
	const burnResult = await execute(
		"PSM", 
		{from: taskArgs.address, log: true},
		"getCollateral",
		taskArgs.address,
		[usdcBytes],
		[ethers.utils.parseUnits(taskArgs.amount, 6).toString()]
	);

	console.log("✅ d2o burn successful: ", burnResult.transactionHash);
});
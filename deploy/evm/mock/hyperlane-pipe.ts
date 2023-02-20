import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

function byteify(address: string) {
    return ethers.utils.hexZeroPad(ethers.utils.hexlify(address), 32)
}
function fray(ray: string) { 
	return ethers.utils.parseEther(ray).mul("1000000000")
}

const deployHyperlanePipe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy, execute, read} = deployments;
	const {deployer, treasury} = await getNamedAccounts();

	const chainIdOne 	= 1;
	const chainIdTwo 	= 2;
	const d2oOne 		= await deployments.get("d2oOne");
	const d2oThree 		= await deployments.get("d2oThree");

	// Deploy the pipes.

	const hyperlanePipeOne = await deploy("HyperlanePipeOne", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        contract: "HyperlanePipe"
    });

	const hyperlanePipeTwo = await deploy("HyperlanePipeTwo", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        contract: "HyperlanePipe"
    });

	// Deploy the mock endpoint/mailbox.
	// NOTE: There is a single mock mailbox for both "networks". As opposed to the 
	// layer zero mocks where there is one for each "network".

	await deploy("MockHyperlaneEnvironment", {
        from: deployer,
        args: [chainIdOne, chainIdTwo],
        log: true,
        autoMine: true
    });

	// Get the addresses for the interchain gas paymaster and mailbox.

	const mailboxOne = await read(
		"MockHyperlaneEnvironment",
		{from: deployer},
		"mailboxes",
		1
	);

	const igpsOne = await read(
		"MockHyperlaneEnvironment",
		{from: deployer},
		"igps",
		1
	);

	const mailboxTwo = await read(
		"MockHyperlaneEnvironment",
		{from: deployer},
		"mailboxes",
		2
	);

	const igpsTwo = await read(
		"MockHyperlaneEnvironment",
		{from: deployer},
		"igps",
		2
	);

	// Permission pipe contracts to mint and burn d2o.

	await execute(
		"d2oOne",
		{from: deployer, log: true},
		"rely",
		hyperlanePipeOne.address
	)

	await execute(
		"d2oThree",
		{from: deployer, log: true},
		"rely",
		hyperlanePipeTwo.address
	)

	// Set up the pipe contracts by registering the remotes and setting fee amounts.

	await execute(
		"HyperlanePipeOne",
		{from: deployer, log: true},
		"initialize",
		mailboxOne, igpsOne, d2oOne.address, 10000, treasury
	);

	await execute(
		"HyperlanePipeTwo",
		{from: deployer, log: true},
		"initialize",
		mailboxTwo, igpsTwo, d2oThree.address, 10000, treasury
	);

	await execute(
		"HyperlanePipeOne",
		{from: deployer, log: true},
		"setTeleportFee",
		fray("0.003")
	);

	await execute(
		"HyperlanePipeOne",
		{from: deployer, log: true},
		"enrollRemoteRouter",
		2, byteify(hyperlanePipeTwo.address)
	);

	await execute(
		"HyperlanePipeTwo",
		{from: deployer, log: true},
		"setTeleportFee",
		fray("0.003")
	);

	await execute(
		"HyperlanePipeTwo",
		{from: deployer, log: true},
		"enrollRemoteRouter",
		1, byteify(hyperlanePipeOne.address)
	);

	console.log("✅ Hyperlane deployment successful.")
};

module.exports = deployHyperlanePipe;
module.exports.tags = ["hyperlane-pipe", "mock"];
module.exports.dependencies = ["d2o"];
const { ethers } = require("hardhat");
const hyper = require("@hyperlane-xyz/sdk");

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  
  // Set up a MultiProvider with the default providers.
const multiProvider = new hyper.MultiProvider({
    moonbasealpha: hyper.chainConnectionConfigs.moonbasealpha,
    goerli: hyper.chainConnectionConfigs.goerli,
});
  
// Create an AbacusCore instance for the mainnet environment.
const core = hyper.HyperlaneCore.fromEnvironment('testnet2',multiProvider);
const calculator = new hyper.InterchainGasCalculator(multiProvider,core);
const toMoonbasePayment = calculator.estimatePaymentForHandleGas('goerli','moonbasealpha',ethers.BigNumber.from(200_000));

toMoonbasePayment.then((res)=>{
    console.log('Goerli -> Moonbase payment for 200k handle gas on destination:');
    console.log("Fee: " + `${ethers.utils.formatEther(res)}` + "\n")
});

//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }

// Contracts and contract factories.
let dPrimeFactory, goerliDPRIME;
let hyperlaneConnectorFactory, goerliHyperlane;

async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    hyperlaneConnectorFactory = await ethers.getContractFactory("dPrimeConnectorHyperlane");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function newSetup(){

    const [deployer] = await ethers.getSigners();

    goerliDPRIME = await dPrimeFactory.deploy();
    goerliHyperlane = await hyperlaneConnectorFactory.deploy();

    console.log("Deployer:                      ", deployer.address);
    console.log("Goerli dPrime address:       ", goerliDPRIME.address);
    console.log("goerli connector address:    ", goerliHyperlane.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();


    goerliDPRIME = await dPrimeFactory.attach("0xb155bC03bdb17990b62010d8adE5d9347151FdC6");
    goerliHyperlane = await hyperlaneConnectorFactory.attach("0x4e7Ff8F3Dadd7cC40cA019c987ab252d80da7E34");
    console.log("attached");
}

async function init() {
    let res = await goerliHyperlane.initialize("0x01812D60958798695391dacF092BAc4a715B1718", "0x44b764045BfDC68517e10e783E69B376cef196B2", goerliDPRIME.address);
}

async function mint(){
    console.log("Minting");
    await goerliDPRIME.mint("0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e", fwad("999"));
}

async function setTrustedRemote(){
    console.log("Setting remote");
    let result = await goerliHyperlane.enrollRemoteRouter("1836002657", ethers.utils.hexZeroPad("0x4886474FAE7FA56145B8fFf1bF2C4FB65611e757", 32));
    console.log(result);
}

async function authConnector(){
    let tx = await goerliDPRIME.rely(goerliHyperlane.address);
    console.log(tx);
}

async function approveMax(){
    userDPrime = await goerliDPRIME.connect(addr1);
    let txwait = await (await userDPrime.approve(goerliHyperlane.address, MAX_INT)).wait()
    console.log("Done approval")

}

async function check(){
    console.log(addr1);
    console.log(await goerliDPRIME.admins(goerliHyperlane.address));
    console.log(await goerliDPRIME.allowance(addr1.address, goerliHyperlane.address));
    console.log(await goerliHyperlane.routers("0x6d6f2d61"));
    
}

async function setConnectionManager(){
    let tx = await goerliHyperlane.setAbacusConnectionManager("0x01812D60958798695391dacF092BAc4a715B1718");
}

async function sendRemote(){
    console.log(await toMoonbasePayment);

    userConnector = await goerliHyperlane.connect(addr1);

    let tx = await userConnector.transferRemote("0x6d6f2d61", "0x7B92eD00d96DfaFA1dF6E5531F1D502AaBF4834e", fwad("100"), {value: toMoonbasePayment});
    let txwait = await tx.wait();
    console.log(txwait);
}




main()
    .then(() => attach())
    // .then(() => approveMax())
    .then(() => sendRemote())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
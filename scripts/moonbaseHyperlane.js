const { ethers } = require("hardhat");
const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";


//Format as wad, ray, rad
function fwad(wad) { return ethers.utils.parseEther(wad) }

// Contracts and contract factories.
let dPrimeFactory, moonbaseDPRIME;
let hyperlaneConnectorFactory, moonbaseHyperlane;

async function main(){
    dPrimeFactory           = await ethers.getContractFactory("dPrime");
    hyperlaneConnectorFactory = await ethers.getContractFactory("dPrimeConnectorHyperlane");

    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
}

async function newSetup(){

    const [deployer] = await ethers.getSigners();

    moonbaseDPRIME = await dPrimeFactory.deploy();
    moonbaseHyperlane = await hyperlaneConnectorFactory.deploy();

    console.log("Deployer:                      ", deployer.address);
    console.log("Moonbase dPrime address:       ", moonbaseDPRIME.address);
    console.log("Moonbase connector address:    ", moonbaseHyperlane.address, "\n");
}

async function attach(){

    const [deployer] = await ethers.getSigners();

    //"0xD356C996277eFb7f75Ee8bd61b31cC781A12F54f", "0xeb6f11189197223c656807a83B0DD374f9A6dF44", moonbaseDPRIME.address

    moonbaseDPRIME = await dPrimeFactory.attach("0x0F10f127623534fDF23D17590cE3B1C0AEEA811F");
    moonbaseHyperlane = await hyperlaneConnectorFactory.attach("0x4886474FAE7FA56145B8fFf1bF2C4FB65611e757");
    console.log("attached");
}

async function init() {
    let res = await moonbaseHyperlane.initialize("0xD356C996277eFb7f75Ee8bd61b31cC781A12F54f", "0xeb6f11189197223c656807a83B0DD374f9A6dF44", moonbaseDPRIME.address);
}

async function mint(){
    console.log("Minting");
    await dPrime.mint("0x57A80C11413d4014B223687E07C827e8175F20e4", fwad("999"));
}

async function setTrustedRemote(){
    console.log("Setting remote");
    let result = await moonbaseHyperlane.enrollRemoteRouter("5", ethers.utils.hexZeroPad("0x4e7Ff8F3Dadd7cC40cA019c987ab252d80da7E34", 32));
    console.log(result);
}

async function check(){
    console.log(addr1);
    console.log(await moonbaseDPRIME.admins(moonbaseHyperlane.address));
    console.log(await moonbaseDPRIME.allowance(addr1.address, moonbaseHyperlane.address));
}

async function authConnector(){
    let tx = await moonbaseDPRIME.rely(moonbaseHyperlane.address);
    console.log(tx);
}

async function approveMax(){
    userDPrime = await moonbaseDPRIME.connect(addr1);
    let txwait = await (await userDPrime.approve(moonbaseHyperlane.address, MAX_INT)).wait()
    console.log("Done approval")

}


main()
    .then(() => attach())
    // .then(() => authConnector())
    .then(() => check())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
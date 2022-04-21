async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const DPrimeFactory = await ethers.getContractFactory("dPrime");
    const dPrime = await DPrimeFactory.deploy();

    console.log("dPrime address:", dPrime.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

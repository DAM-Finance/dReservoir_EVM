// Currently truffle, edit for hardhat

// const MultiCollateralVault = artifacts.require("MultiCollateralVault");
// const TestERC20 = artifacts.require("TestERC20");
// const ethers = require("ethers");

// describe("When using the multi collateral vault", () => {

//     let multiCollateralVault;
//     let accounts;
//     let collateral;
//     let collateral2;

//     before(async () => {
//         accounts = await web3.eth.getAccounts();
//         multiCollateralVault = await MultiCollateralVault.deployed();
//         collateral = await TestERC20.deployed();
//         collateral2 = await TestERC20.new("Collateral2", "C2");
//     });

//     contract('MCV', async () => {

//         it('Should have an address', async () => {
//             assert(multiCollateralVault.address != ethers.constants.AddressZero);

//         });

//         it('Should have a mapping of tokens after adding two test ERCs', async () => {

//             await collateral.increaseAllowance(multiCollateralVault.address, "999999999999999999999999999999999999", { from: accounts[1] });
//             await collateral2.increaseAllowance(multiCollateralVault.address, "799999999999999999999999999999999999", { from: accounts[1] });

//             await collateral.mint(accounts[1], "999999999999999999999999999999999999", { from: accounts[1] });
//             await collateral2.mint(accounts[1], "799999999999999999999999999999999999", { from: accounts[1] });

//             await multiCollateralVault.mint([collateral.address, collateral2.address], [10, 15], { from: accounts[1] });



//         });
//     });
// });
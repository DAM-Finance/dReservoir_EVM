require("@nomiclabs/hardhat-waffle");
/**
 * @type import('hardhat/config').HardhatUserConfig
 */

module.exports = {
  solidity: "0.8.9", //TODO: Launch with 0.8.13 but run locally with hardhat at 0.8.9 because its latest supported version *4/21*
  settings: {
    optimizer: {
      enabled: true,
      runs: 999,
    },
  },
};

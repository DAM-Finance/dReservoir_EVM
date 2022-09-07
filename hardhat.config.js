require("@nomiclabs/hardhat-waffle");
const {privateKey, privateKeyTwo} = require('./secrets.json');
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    moonbase: {
      url: 'https://rpc.api.moonbase.moonbeam.network',
      chainId: 1287,
      accounts: [privateKey, privateKeyTwo]
    },

    // rinkeby: {
    //   url: 'https://rpc.api.moonbase.moonbeam.network',
    //   chainId: 1287,
    //   accounts: [privateKey, privateKeyTwo]
    // },

    testbnb: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      accounts: [privateKey, privateKeyTwo]
    },
  },
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
 }

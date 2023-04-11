import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/types';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-gas-reporter';
import '@typechain/hardhat';
import 'solidity-coverage';
import 'hardhat-deploy-tenderly';
import {node_url, accounts, addForkConfiguration} from './utils/network';
import '@nomicfoundation/hardhat-chai-matchers';
import './tasks/d2o-teleport-layer-zero.ts'
import './tasks/d2o-teleport-hyperlane.ts'
import './tasks/d2o-swap.ts'
import './tasks/d2o-burn.ts'
import './tasks/d2o-balance.ts'
import './tasks/usdc-mint.ts'
import './tasks/usdc-balance.ts'
import './tasks/eth-balance.ts'
import './tasks/hyperlane-set-gas-oracle-address.ts'
import './tasks/hyperlane-update-gas-oracle-data.ts'
import './tasks/hyperlane-set-remote-ism.ts'
import './tasks/hyperlane-enroll-remote.ts'
import './tasks/hyperlane-enroll-validator.ts'
import './tasks/hyperlane-validator-announce.ts'
import './tasks/hyperlane-set-teleport-fee.ts'
import './tasks/swap_archadmin_ethereum.ts'
import './tasks/swap_archadmin_moonbeam.ts'

const config: HardhatUserConfig = {
	solidity: {
		compilers: [
			{
				version: '0.8.17',
				settings: {
					optimizer: {
						enabled: true,
						runs: 2000
					}
				}
			}
		]
	},
	namedAccounts: {
		// TODO: We should have a dedicated address for the "treasury" account.
		deployer: 0,
		treasury: 1,
		user: 2	
	},
	networks: addForkConfiguration({
		hardhat: {
			initialBaseFeePerGas: 0, // to fix : https://github.com/sc-forks/solidity-coverage/issues/652, see https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136
			accounts: accounts(),
			saveDeployments: false,
			deploy: ['deploy/evm/mock'],
			mining: {
				auto: false,
				interval: 5000
			}
		},
		mock: {
			url: node_url('localhost'),
			accounts: accounts(),
			saveDeployments: false,
			deploy: ['deploy/evm/mock'],
			mining: {
				auto: false,
				interval: 5000
			}
		},
		testOne: {
			url: "http://127.0.0.1:13371/",
			accounts: accounts(),
			deploy: ['deploy/evm/test'],
			mining: {
				auto: false,
				interval: 5000
			}
		},
		testTwo: {
			url: "http://127.0.0.1:13372/",
			accounts: accounts(),
			deploy: ['deploy/evm/test'],
			mining: {
				auto: false,
				interval: 5000
			}
		},
		goerli: {
			url: node_url('goerli'),
			accounts: accounts('goerli'),
			deploy: ['deploy/evm/test']
		},
		moonbase: {
			url: node_url('moonbase'),
			accounts: accounts('moonbase'),
			deploy: ['deploy/evm/test']
		},
		ethereum: {
			url: node_url('ethereum'),
			accounts: accounts('ethereum'),
			deploy: ['deploy/evm/main']
		},
		moonbeam: {
			url: node_url('moonbeam'),
			accounts: accounts('moonbeam'),
			deploy: ['deploy/evm/main']
		},
		shibuya: {
			url: node_url('shibuya'),
			accounts: accounts('shibuya'),
			deploy: ['deploy/evm/test']
		},
		astar: {
			url: node_url('astar'),
			accounts: accounts('astar'),
			deploy: ['deploy/evm/main']
		},
	}
  ),
  etherscan: {
	apiKey: "foo",
	customChains: [
		{
			network: "astar",
			chainId: 592,
			urls: {
				apiURL: "https://blockscout.com/astar/api/",
				browserURL: "https://blockscout.com/astar/"
			}
		}
	]
  },
  paths: {
    sources: "./solidity/contracts",
    tests: "./solidity/test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  },
	gasReporter: {
		currency: 'USD',
		gasPrice: 100,
		enabled: process.env.REPORT_GAS ? true : false,
		coinmarketcap: process.env.COINMARKETCAP_API_KEY,
		maxMethodDiff: 10
	},
	typechain: {
		outDir: 'typechain',
		target: 'ethers-v5'
	},
	external: process.env.HARDHAT_FORK
		? {
				deployments: {
					// process.env.HARDHAT_FORK will specify the network that the fork is made from.
					// these lines allow it to fetch the deployments from the network being forked from both for node and deploy task
					hardhat: ['deployments/' + process.env.HARDHAT_FORK],
					localhost: ['deployments/' + process.env.HARDHAT_FORK]
				}
		  }
		: undefined,

	tenderly: {
		project: 'template-ethereum-contracts',
		username: process.env.TENDERLY_USERNAME as string
	}
};

export default config;

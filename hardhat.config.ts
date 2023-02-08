import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/types';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-gas-reporter';
import '@typechain/hardhat';
import 'solidity-coverage';
import 'hardhat-deploy-tenderly';
import {node_url, accounts, addForkConfiguration} from './utils/network';
import '@nomicfoundation/hardhat-chai-matchers';
import './tasks/d2O_teleport.ts'
import './tasks/d2O_swap.ts'
import './tasks/d2O_balance.ts'
import './tasks/usdc_mint.ts'
import './tasks/usdc_balance.ts'
import './tasks/eth_balance.ts'
import './tasks/setup_contracts_goerli.ts'
import './tasks/setup_contracts_moonbase.ts'
import './tasks/setup_contracts_ethereum.ts'
import './tasks/setup_contracts_moonbeam.ts'
import './tasks/_swap_archadmin.ts'
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
			deploy: ['deploy/hardhat/']
		},
		localhost: {
			url: node_url('localhost'),
			accounts: accounts(),
			deploy: ['deploy/localhost/']
		},
		goerli: {
			url: node_url('goerli'),
			accounts: accounts('goerli'),
			deploy: ['deploy/goerli']
		},
		moonbase: {
			url: node_url('moonbase'),
			accounts: accounts('moonbase'),
			deploy: ['deploy/moonbase']
		},
		ethereum: {
			url: node_url('ethereum'),
			accounts: accounts('ethereum'),
			deploy: ['deploy/ethereum']
		},
		moonbeam: {
			url: node_url('moonbeam'),
			accounts: accounts('moonbeam'),
			deploy: ['deploy/moonbeam']
		},

	}),
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

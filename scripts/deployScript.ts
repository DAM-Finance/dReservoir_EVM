const { ethers } = require("hardhat");
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

const dotenvConfigPath: string = process.env.DOTENV_CONFIG_PATH || "./.env";
dotenvConfig({ path: resolve(__dirname, dotenvConfigPath) });

// Ensure that we have all the environment variables we need.
const seed: string | undefined = process.env.seed;
if (!seed) {
  throw new Error("Please set your seed phrase in a .env file");
}

// "seed=nmemonic" npm scripts/deployScript.js

console.log(process.env);
console.log(seed);

const address = "0";

const account = ethers.utils.HDNode.fromMnemonic(seed).derivePath(`m/44'/60'/0'/0/${address}`);
console.log(account);
const signer = new ethers.Wallet(account, provider);

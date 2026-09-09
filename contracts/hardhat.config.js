require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const ALCHEMY_SEPOLIA_URL =
  process.env.ALCHEMY_SEPOLIA_URL ||
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`;

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  process.env.DEPLOYER_PRIVATE_KEY ||
  "";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: ALCHEMY_SEPOLIA_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts-hardhat",
  },
};

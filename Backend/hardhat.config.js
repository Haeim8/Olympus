// hardhat.config.js
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();  
require("@nomicfoundation/hardhat-ignition");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true
    },
  },
  networks: {
    sepoliaBase: {
      url: "https://sepolia.base.org",
      chainId: 84532,
      accounts: [
        process.env.PRIVATE_KEY !== undefined ? `0x${process.env.PRIVATE_KEY}` : "",
        process.env.PRIVATE_KEY_2 !== undefined ? `0x${process.env.PRIVATE_KEY_2}` : "",
        process.env.PRIVATE_KEY_3 !== undefined ? `0x${process.env.PRIVATE_KEY_3}` : "",
        process.env.PRIVATE_KEY_4 !== undefined ? `0x${process.env.PRIVATE_KEY_4}` : ""
      ]
    }
  },
  mocha: {
    timeout: 1200000
  }
};
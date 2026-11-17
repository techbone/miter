import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-viem';

const XLAYER_RPC = process.env.XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech';
const deployer = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    hardhat: {
      // Tests run against a fork of X Layer mainnet: real TapeOut processors, no mocks.
      forking: { url: XLAYER_RPC },
      chainId: 196,
      chains: { 196: { hardforkHistory: { cancun: 0 } } },
    },
    xlayer: {
      url: XLAYER_RPC,
      chainId: 196,
      accounts: deployer ? [deployer] : [],
    },
  },
  mocha: { timeout: 600_000 },
};

export default config;

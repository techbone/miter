/**
 * Seeds a local Hardhat fork of X Layer mainnet for UI rehearsal: deploys MiterCourt
 * and opens two bounties on live circuits. Prints the court address and an
 * impersonated, funded hunter address. Free: nothing touches mainnet.
 *
 *   (in contracts/) npx hardhat node   then   tsx seed-fork.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, http, parseEther, toHex, type Abi, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { makeClient, xLayer } from '@miter/core';

const RPC = 'http://127.0.0.1:8545';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const art = JSON.parse(readFileSync(resolve(root, 'contracts/artifacts/contracts/MiterCourt.sol/MiterCourt.json'), 'utf8'));
const abi = art.abi as Abi;
const pub = makeClient([RPC]);
const chain = { ...xLayer, rpcUrls: { default: { http: [RPC] } } } as const;

async function fresh() {
  const a = privateKeyToAccount(generatePrivateKey());
  await pub.request({ method: 'hardhat_setBalance' as any, params: [a.address, toHex(parseEther('10'))] as any });
  await pub.request({ method: 'hardhat_impersonateAccount' as any, params: [a.address] as any });
  return a;
}

// X Layer produces a block about every second; a Hardhat fork only mines on transactions.
// Match the real chain so the UI's "wait one block" step behaves as on mainnet.
await pub.request({ method: 'evm_setIntervalMining' as any, params: [1000] as any });

const funder = await fresh();
const hunter = await fresh();
const w = createWalletClient({ account: funder, chain, transport: http(RPC) });
const wait = (hash: Hex) => pub.waitForTransactionReceipt({ hash });

const deploy = await wait(await w.deployContract({ abi, bytecode: art.bytecode, args: ['0x1f09DAeFA827f02CBb40967cc91b259763760761', funder.address, 500] }));
const court = deploy.contractAddress!;
const now = Number((await pub.getBlock()).timestamp);
// #1: AND vs NAND: claimable (they're complements)
await wait(await w.writeContract({ address: court, abi, functionName: 'open', args: ['0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6', 3522n, '0x60918C204F3c94630D3D793738Fc36293c8405D6', 1010n, now + 72 * 3600], value: parseEther('0.25') }));
// #2: two copies of an 8-bit adder: a pure bond (provably unclaimable)
await wait(await w.writeContract({ address: court, abi, functionName: 'open', args: ['0x69F663931209096037474d7C20402232E5C762cA', 717n, '0x4f3B708af365B8f339Dd35a8985Ffe06c2553400', 27n, now + 7 * 24 * 3600], value: parseEther('0.5') }));

const out = { court, funder: funder.address, hunter: hunter.address };
writeFileSync(resolve(root, 'scripts/.fork-seed.json'), JSON.stringify(out, null, 2));
console.log(out);

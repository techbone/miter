/**
 * Headless end-to-end run of Miter's core flow through the same core library
 * the web app uses. Every circuit evaluation is a real TapeOut processor.
 *
 *   Fork (free):    pnpm e2e                      (expects `hardhat node` on :8545)
 *   Mainnet:        pnpm e2e --mainnet --broadcast (uses DEPLOYER/HUNTER keys from .env)
 *
 * Steps: load target + spec from chain → simulator vs eval trust check → MiniSat
 * miter → eval cross-check → open bounty → commit → reveal → verify Claimed event,
 * payout and Broken status → write docs/evidence/e2e-<network>-<ts>.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWalletClient, decodeEventLog, encodeAbiParameters, formatEther, http, keccak256, parseEther,
  toHex, type Abi, type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  buildEquivalenceMiter, bytesToHex, evaluate, evalOnChain, loadCircuit, makeClient, mapResolver, runMiter,
  xLayer, type Circuit,
} from '@miter/core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(here, '..');
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

// --- env (.env is optional; only mainnet needs it) ---
if (existsSync(resolvePath(root, '.env'))) {
  for (const line of readFileSync(resolvePath(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const MAINNET = flag('mainnet');
const BROADCAST = flag('broadcast');
const RPC = MAINNET ? (process.env.XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech') : opt('rpc', 'http://127.0.0.1:8545');
const parsePair = (s: string) => { const [cpu, id] = s.split(':'); return { cpu: cpu as Hex, id: BigInt(id) }; };
const TARGET = parsePair(opt('target', '0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6:3522'));
const SPEC = parsePair(opt('spec', '0x60918C204F3c94630D3D793738Fc36293c8405D6:1010'));
const STAKE = parseEther(opt('stake', MAINNET ? '0.0005' : '1'));

if (MAINNET && !BROADCAST) {
  console.log('Mainnet dry run: add --broadcast to send transactions. Nothing was sent.');
}

const artifact = JSON.parse(readFileSync(resolvePath(root, 'contracts/artifacts/contracts/MiterCourt.sol/MiterCourt.json'), 'utf8'));
const abi = artifact.abi as Abi;
const chain = { ...xLayer, rpcUrls: { default: { http: [RPC] } } } as const;
const pub = makeClient([RPC]);

const log: any = { network: MAINNET ? 'xlayer-mainnet' : 'xlayer-fork', rpc: MAINNET ? RPC : 'local hardhat fork of X Layer mainnet', startedAt: new Date().toISOString(), steps: [] };
const step = (name: string, data: Record<string, unknown> = {}) => {
  const t = Date.now();
  log.steps.push({ step: name, at: new Date(t).toISOString(), ...data });
  console.log(`✓ ${name}`, Object.keys(data).length ? JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) : '');
};

async function fundedAccount(envKey: string) {
  if (MAINNET) {
    const pk = process.env[envKey] as Hex | undefined;
    if (!pk) throw new Error(`${envKey} missing in .env`);
    return privateKeyToAccount(pk);
  }
  // Fresh keys on the fork: well-known dev keys are 7702-delegated on X Layer (see build log).
  const acct = privateKeyToAccount(generatePrivateKey());
  await pub.request({ method: 'hardhat_setBalance' as any, params: [acct.address, toHex(parseEther('10'))] as any });
  return acct;
}

// 1. load circuits
const cache = new Map<string, Circuit>();
const resolve = mapResolver(cache);
const target = (await loadCircuit(pub, TARGET.cpu, TARGET.id, cache)).root;
const spec = (await loadCircuit(pub, SPEC.cpu, SPEC.id, cache)).root;
step('loaded circuits from X Layer', {
  target: `${target.cpu}:${target.id}`, spec: `${spec.cpu}:${spec.id}`, pins: `${target.nIn}→${target.nOut}`,
  targetHash: target.netlistHash, specHash: spec.netlistHash,
});

// 2. trust check: our simulator must agree with the processors before we rely on it
let agreed = 0;
for (let x = 0; x < Math.min(16, 2 ** target.nIn); x++) {
  const input = Uint8Array.from({ length: Math.ceil(target.nIn / 8) }, (_, k) => (x >> (8 * k)) & 0xff);
  for (const c of [target, spec]) {
    const [mine, chainOut] = [evaluate(c, input, resolve), await evalOnChain(pub, c.cpu, c.id, input)];
    if (bytesToHex(mine) !== bytesToHex(chainOut)) throw new Error(`simulator disagrees with ${c.key} on ${bytesToHex(input)}`);
    agreed++;
  }
}
step('simulator matches processor eval', { vectors: agreed });

// 3. hunt
const verdict = runMiter(buildEquivalenceMiter(target, spec, resolve));
if (verdict.kind !== 'counterexample') throw new Error(`no counterexample: circuits are equivalent (${verdict.how})`);
const input = bytesToHex(verdict.input);
const [tOut, sOut] = await Promise.all([evalOnChain(pub, target.cpu, target.id, verdict.input), evalOnChain(pub, spec.cpu, spec.id, verdict.input)]);
if (bytesToHex(tOut) === bytesToHex(sOut)) throw new Error('solver counterexample does not hold on chain');
step('solver found a counterexample, confirmed by eval', { input, targetOut: bytesToHex(tOut), specOut: bytesToHex(sOut), solverMs: Number(verdict.ms.toFixed(2)), cnf: verdict.stats });

if (MAINNET && !BROADCAST) process.exit(0);

// 4. accounts + court
const funder = await fundedAccount('DEPLOYER_PRIVATE_KEY');
const hunter = await fundedAccount('HUNTER_PRIVATE_KEY');
const wf = createWalletClient({ account: funder, chain, transport: http(RPC) });
const wh = createWalletClient({ account: hunter, chain, transport: http(RPC) });
const wait = async (hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`tx ${hash} reverted`);
  return r;
};

let court = (opt('court', process.env.MITER_COURT_ADDRESS ?? '') || undefined) as Hex | undefined;
if (!court) {
  const hash = await wf.deployContract({ abi, bytecode: artifact.bytecode as Hex, args: ['0x1f09DAeFA827f02CBb40967cc91b259763760761', funder.address, 500] });
  const r = await wait(hash);
  court = r.contractAddress!;
  step('deployed MiterCourt', { court, tx: hash, gasUsed: r.gasUsed });
}
log.court = court;

// 5. open bounty
const block = await pub.getBlock();
const expiry = Number(block.timestamp) + 3600;
const openTx = await wf.writeContract({ address: court, abi, functionName: 'open', args: [target.cpu, target.id, spec.cpu, spec.id, expiry], value: STAKE });
const openR = await wait(openTx);
const bountyId = (await pub.readContract({ address: court, abi, functionName: 'bountyCount' })) as bigint;
step('opened bounty', { bountyId, stake: formatEther(STAKE), tx: openTx, gasUsed: openR.gasUsed });

// 6. commit
const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
const commitment = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }, { type: 'bytes32' }], [bountyId, input, hunter.address, salt]));
const commitTx = await wh.writeContract({ address: court, abi, functionName: 'commit', args: [commitment] });
const commitR = await wait(commitTx);
step('committed', { commitment, tx: commitTx, block: commitR.blockNumber });

// 7. wait for a later block, then reveal
while ((await pub.getBlockNumber({ cacheTime: 0 })) <= commitR.blockNumber) {
  if (!MAINNET) await pub.request({ method: 'evm_mine' as any, params: [] as any });
  else await new Promise((r) => setTimeout(r, 1000));
}
const balBefore = await pub.getBalance({ address: hunter.address });
const revealTx = await wh.writeContract({ address: court, abi, functionName: 'reveal', args: [bountyId, input, salt] });
const revealR = await wait(revealTx);
const balAfter = await pub.getBalance({ address: hunter.address });
const claimed = revealR.logs
  .map((l) => { try { return decodeEventLog({ abi, data: l.data, topics: l.topics }); } catch { return null; } })
  .find((e) => e?.eventName === 'Claimed') as any;
if (!claimed) throw new Error('no Claimed event');
step('revealed: contract re-ran both circuits and paid', {
  tx: revealTx, block: revealR.blockNumber, gasUsed: revealR.gasUsed,
  paid: formatEther(claimed.args.paid), fee: formatEther(claimed.args.fee),
  targetOutOnChain: claimed.args.targetOut, specOutOnChain: claimed.args.specOut,
  hunterNetGain: formatEther(balAfter - balBefore),
});

// 8. verify status from the source of truth
const [bonded, brokenBy] = (await pub.readContract({ address: court, abi, functionName: 'statusOf', args: [target.cpu, target.id, spec.cpu, spec.id] })) as [bigint, bigint];
const b = (await pub.readContract({ address: court, abi, functionName: 'getBounty', args: [bountyId] })) as any;
if (brokenBy !== bountyId || b.state !== 2) throw new Error('status not updated');
step('verified on-chain status', { state: 'Paid', brokenAgainstSpecBy: brokenBy, bondedRemaining: formatEther(bonded) });

log.finishedAt = new Date().toISOString();
log.ok = true;
mkdirSync(resolvePath(root, 'docs/evidence'), { recursive: true });
const out = resolvePath(root, `docs/evidence/e2e-${log.network}-${Date.now()}.json`);
writeFileSync(out, JSON.stringify(log, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
console.log(`\nE2E PASSED · evidence: ${out.replace(root + '/', '')}`);

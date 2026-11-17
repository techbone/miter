/**
 * Cross-checks our TAP-02 simulator against live TapeOut processors on X Layer.
 * Samples circuits across processors, runs random inputs (and random state for
 * stateful circuits) locally and via eth_call, and requires byte-exact agreement.
 *
 *   pnpm --filter @miter/scripts verify-sim [sampleCircuits=60] [vectorsEach=8]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  bytesToHex, evaluate, evalOnChain, listProcessors, loadCircuit, makeClient, mapResolver,
  processorAbi, step, stepOnChain, stats, type Circuit, type Hex,
} from '@miter/core';

const SAMPLE = Number(process.argv[2] ?? 60);
const VECTORS = Number(process.argv[3] ?? 8);
const MAX_GATES = 15_000; // keep eth_call under public RPC gas caps

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(0x6d17e5);
const randBytes = (nBits: number) => Uint8Array.from({ length: Math.ceil(nBits / 8) }, () => Math.floor(rand() * 256));
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const client = makeClient();
const t0 = Date.now();
const cpus = await listProcessors(client);
const counts = await Promise.all(
  cpus.map((c) => client.readContract({ address: c, abi: processorAbi, functionName: 'nextId' }).then((n) => Number(n) - 1)),
);
const all: Array<{ cpu: Hex; id: bigint }> = [];
cpus.forEach((cpu, i) => { for (let id = 1; id <= counts[i]; id++) all.push({ cpu, id: BigInt(id) }); });
console.log(`processors: ${cpus.length} · circuits: ${all.length} · non-empty processors: ${counts.filter((n) => n > 0).length}`);

// shuffle and sample
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }

const cache = new Map<string, Circuit>();
const resolve = mapResolver(cache);
const results: any[] = [];
let checked = 0, vectorsOk = 0, vectorsBad = 0, skipped = 0;
for (const t of all) {
  if (checked >= SAMPLE) break;
  let root: Circuit;
  try {
    root = (await loadCircuit(client, t.cpu, t.id, cache)).root;
  } catch (e: any) {
    results.push({ cpu: t.cpu, id: String(t.id), error: e.message }); skipped++; continue;
  }
  if (root.gateCount > MAX_GATES) { skipped++; continue; }
  const st = stats(root.netlist);
  let ok = 0, bad = 0; const mismatches: any[] = [];
  for (let v = 0; v < VECTORS; v++) {
    const inputs = randBytes(root.nIn);
    try {
      if (root.nState === 0) {
        const [mine, theirs] = [evaluate(root, inputs, resolve), await evalOnChain(client, t.cpu, t.id, inputs)];
        if (eq(mine, theirs)) ok++; else { bad++; mismatches.push({ inputs: bytesToHex(inputs), mine: bytesToHex(mine), chain: bytesToHex(theirs) }); }
      } else {
        const state = randBytes(root.nState);
        const mine = step(root, state, inputs, resolve);
        const theirs = await stepOnChain(client, t.cpu, t.id, state, inputs);
        if (eq(mine.outputs, theirs.outputs) && eq(mine.newState, theirs.newState)) ok++;
        else { bad++; mismatches.push({ state: bytesToHex(state), inputs: bytesToHex(inputs), mine: { o: bytesToHex(mine.outputs), s: bytesToHex(mine.newState) }, chain: { o: bytesToHex(theirs.outputs), s: bytesToHex(theirs.newState) } }); }
      }
    } catch (e: any) {
      mismatches.push({ error: e.shortMessage ?? e.message }); bad++;
    }
  }
  checked++; vectorsOk += ok; vectorsBad += bad;
  const line = { cpu: t.cpu, id: String(t.id), nIn: root.nIn, nOut: root.nOut, nState: root.nState, gateCount: root.gateCount, ...st, ok, bad, mismatches: mismatches.slice(0, 2) };
  results.push(line);
  console.log(`${bad ? 'MISMATCH' : 'ok      '} ${t.cpu}:${t.id}  in=${root.nIn} out=${root.nOut} state=${root.nState} gates=${root.gateCount} nand=${st.nand} latch=${st.latch} ref=${st.ref}  ${ok}/${ok + bad}`);
}
const summary = {
  ranAt: new Date().toISOString(), chainId: 196, processors: cpus.length, totalCircuits: all.length,
  circuitsChecked: checked, skipped, vectorsMatched: vectorsOk, vectorsMismatched: vectorsBad, seconds: (Date.now() - t0) / 1000,
};
console.log(summary);
mkdirSync('../docs/evidence', { recursive: true });
writeFileSync('../docs/evidence/sim-vs-eval.json', JSON.stringify({ summary, results }, null, 2));
if (vectorsBad) process.exit(1);

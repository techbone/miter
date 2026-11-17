/**
 * Runs an equivalence miter between live TapeOut circuits on X Layer.
 *
 *   tsx miter.ts <cpu:id> <cpu:id> [<cpu:id> ...]
 *
 * With more than two circuits, every pair is checked. Every counterexample is
 * re-checked against the real processors via eval before it is reported.
 */
import {
  buildEquivalenceMiter, bytesToHex, evaluate, evalOnChain, loadCircuit, makeClient, mapResolver,
  runMiter, type Circuit, type Hex,
} from '@miter/core';

const specs = process.argv.slice(2).map((s) => {
  const [cpu, id] = s.split(':');
  return { cpu: cpu as Hex, id: BigInt(id) };
});
if (specs.length < 2) { console.error('usage: tsx miter.ts <cpu:id> <cpu:id> [...]'); process.exit(2); }

const client = makeClient();
const cache = new Map<string, Circuit>();
const resolve = mapResolver(cache);
const circuits: Circuit[] = [];
for (const s of specs) circuits.push((await loadCircuit(client, s.cpu, s.id, cache)).root);
for (const c of circuits) console.log(`${c.cpu}:${c.id}  ${c.nIn}→${c.nOut}  gates=${c.gateCount} state=${c.nState}  hash=${c.netlistHash.slice(0, 10)}…`);

for (let i = 0; i < circuits.length; i++)
  for (let j = i + 1; j < circuits.length; j++) {
    const [a, b] = [circuits[i], circuits[j]];
    const tag = `${a.cpu.slice(0, 8)}:${a.id} vs ${b.cpu.slice(0, 8)}:${b.id}`;
    if (a.nIn !== b.nIn || a.nOut !== b.nOut || a.nState || b.nState) { console.log(`${tag}: incomparable`); continue; }
    const v = runMiter(buildEquivalenceMiter(a, b, resolve));
    if (v.kind === 'equivalent') {
      console.log(`${tag}: EQUIVALENT (${v.how}, ${v.ms.toFixed(1)} ms, ${v.stats.vars} vars / ${v.stats.clauses} clauses)`);
    } else {
      const [ca, cb] = await Promise.all([evalOnChain(client, a.cpu, a.id, v.input), evalOnChain(client, b.cpu, b.id, v.input)]);
      const [la, lb] = [evaluate(a, v.input, resolve), evaluate(b, v.input, resolve)];
      const onchainDiffers = bytesToHex(ca) !== bytesToHex(cb);
      const simMatchesChain = bytesToHex(ca) === bytesToHex(la) && bytesToHex(cb) === bytesToHex(lb);
      console.log(`${tag}: COUNTEREXAMPLE input=${bytesToHex(v.input)} → ${bytesToHex(ca)} vs ${bytesToHex(cb)}  onchainDiffers=${onchainDiffers} simMatchesChain=${simMatchesChain} (${v.ms.toFixed(1)} ms)`);
    }
  }

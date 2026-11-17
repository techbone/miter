import {
  createPublicClient,
  fallback,
  http,
  keccak256,
  parseAbi,
  type PublicClient,
} from 'viem';
import { bytesToHex, hexToBytes, parseNetlist, type Hex } from './netlist.js';
import { circuitKey, computeNState, mapResolver, type Circuit } from './circuit.js';

export const XLAYER_CHAIN_ID = 196;
export const TAPEOUT_FACTORY: Hex = '0x1f09DAeFA827f02CBb40967cc91b259763760761';
export const MULTICALL3: Hex = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const DEFAULT_RPCS = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];

export const xLayer = {
  id: XLAYER_CHAIN_ID,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: DEFAULT_RPCS } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/x-layer' } },
  contracts: { multicall3: { address: MULTICALL3 } },
} as const;

export const factoryAbi = parseAbi([
  'function cpuCount() view returns (uint256)',
  'function cpuAt(uint256 i) view returns (address)',
  'function isCPU(address cpu) view returns (bool)',
]);

export const processorAbi = parseAbi([
  'function nextId() view returns (uint256)',
  'function circuitInfo(uint256 id) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)',
  'function netlist(uint256 id) view returns (bytes)',
  'function eval(uint256 id, bytes inputs) view returns (bytes)',
  'function step(uint256 id, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)',
  'function ownerOf(uint256 id) view returns (address)',
  'function TAPEOUT_FEE() view returns (uint256)',
]);

export function makeClient(rpcs: string[] = DEFAULT_RPCS): PublicClient {
  return createPublicClient({
    chain: xLayer,
    transport: fallback(rpcs.map((u) => http(u, { batch: { batchSize: 50, wait: 8 }, retryCount: 3, timeout: 20_000 }))),
    batch: { multicall: { batchSize: 64 * 1024, wait: 8 } },
  }) as PublicClient;
}

export async function listProcessors(client: PublicClient): Promise<Hex[]> {
  const n = await client.readContract({ address: TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuCount' });
  return Promise.all(
    Array.from({ length: Number(n) }, (_, i) =>
      client.readContract({ address: TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(i)] }),
    ),
  ) as Promise<Hex[]>;
}

export async function circuitCount(client: PublicClient, cpu: Hex): Promise<number> {
  const next = await client.readContract({ address: cpu, abi: processorAbi, functionName: 'nextId' });
  return Number(next) - 1;
}

export interface CircuitInfo { nIn: number; nOut: number; nState: number; gateCount: number }

export async function circuitInfo(client: PublicClient, cpu: Hex, id: bigint): Promise<CircuitInfo> {
  const [nIn, nOut, nState, gateCount] = await client.readContract({
    address: cpu, abi: processorAbi, functionName: 'circuitInfo', args: [id],
  });
  return { nIn, nOut, nState, gateCount };
}

/** Optional persistent cache (IndexedDB in the browser, a Map in Node). Keys are circuit keys. */
export interface NetlistStore {
  get(key: string): Promise<{ info: CircuitInfo; netlist: Hex } | undefined>;
  set(key: string, v: { info: CircuitInfo; netlist: Hex }): Promise<void>;
}

/**
 * Loads a circuit and, recursively, every circuit it REFs (on any processor).
 * Returns the root plus a map holding all dependencies. Checks our computed nState
 * against the processor's circuitInfo so a layout bug can't go unnoticed.
 */
export async function loadCircuit(
  client: PublicClient,
  cpu: Hex,
  id: bigint,
  cache: Map<string, Circuit> = new Map(),
  store?: NetlistStore,
): Promise<{ root: Circuit; deps: Map<string, Circuit> }> {
  const raw = new Map<string, { cpu: Hex; id: bigint; info: CircuitInfo; bytes: Uint8Array; hex: Hex }>();
  const order: string[] = [];
  let frontier: Array<{ cpu: Hex; id: bigint }> = [{ cpu, id }];
  while (frontier.length) {
    const todo = frontier.filter((t) => !cache.has(circuitKey(t.cpu, t.id)) && !raw.has(circuitKey(t.cpu, t.id)));
    const fetched = await Promise.all(
      todo.map(async (t) => {
        const key = circuitKey(t.cpu, t.id);
        const hit = store ? await store.get(key) : undefined;
        if (hit) return { ...t, key, info: hit.info, hex: hit.netlist };
        const [info, hex] = await Promise.all([
          circuitInfo(client, t.cpu, t.id),
          client.readContract({ address: t.cpu, abi: processorAbi, functionName: 'netlist', args: [t.id] }) as Promise<Hex>,
        ]);
        if (store) await store.set(key, { info, netlist: hex });
        return { ...t, key, info, hex };
      }),
    );
    frontier = [];
    for (const f of fetched) {
      if (raw.has(f.key)) continue;
      const bytes = hexToBytes(f.hex);
      raw.set(f.key, { cpu: f.cpu, id: f.id, info: f.info, bytes, hex: f.hex });
      order.push(f.key);
      const nl = parseNetlist(bytes, f.info.nIn, f.info.nOut);
      for (const e of nl.elements) if (e.op === 'ref') frontier.push({ cpu: e.cpu, id: e.id });
    }
  }
  // Build bottom-up: REF graph is acyclic, so retry until all resolve.
  const pending = new Set(order);
  const resolve = mapResolver(cache);
  while (pending.size) {
    let progressed = false;
    for (const key of [...pending]) {
      const r = raw.get(key)!;
      const nl = parseNetlist(r.bytes, r.info.nIn, r.info.nOut);
      const ready = nl.elements.every((e) => e.op !== 'ref' || cache.has(circuitKey(e.cpu, e.id)));
      if (!ready) continue;
      for (const e of nl.elements) {
        if (e.op !== 'ref') continue;
        const sub = cache.get(circuitKey(e.cpu, e.id))!;
        if (sub.nIn !== e.nIns || sub.nOut !== e.nOuts) throw new Error(`REF pin mismatch to ${e.cpu}:${e.id}`);
      }
      const nState = computeNState(nl, resolve);
      if (nState !== r.info.nState) {
        throw new Error(`nState mismatch for ${key}: computed ${nState}, processor says ${r.info.nState}`);
      }
      cache.set(key, {
        key, cpu: r.cpu, id: r.id, nIn: r.info.nIn, nOut: r.info.nOut, nState,
        gateCount: r.info.gateCount, netlist: nl, netlistHash: keccak256(r.hex),
      });
      pending.delete(key);
      progressed = true;
    }
    if (!progressed) throw new Error('REF cycle detected');
  }
  return { root: cache.get(circuitKey(cpu, id))!, deps: cache };
}

export async function evalOnChain(client: PublicClient, cpu: Hex, id: bigint, inputs: Uint8Array): Promise<Uint8Array> {
  const out = await client.readContract({
    address: cpu, abi: processorAbi, functionName: 'eval', args: [id, bytesToHex(inputs)],
  });
  return hexToBytes(out as Hex);
}

export async function stepOnChain(client: PublicClient, cpu: Hex, id: bigint, state: Uint8Array, inputs: Uint8Array) {
  const [newState, outputs] = await client.readContract({
    address: cpu, abi: processorAbi, functionName: 'step', args: [id, bytesToHex(state), bytesToHex(inputs)],
  });
  return { newState: hexToBytes(newState as Hex), outputs: hexToBytes(outputs as Hex) };
}

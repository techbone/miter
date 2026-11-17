'use client';
import {
  circuitKey, factoryAbi, loadCircuit, makeClient, processorAbi, TAPEOUT_FACTORY,
  type Circuit, type Hex, type NetlistStore,
} from '@miter/core';
import { courtAbi } from './courtAbi';
import { COURT, RPCS, TAPEOUT_RPCS } from './env';

/** MiterCourt reads, receipts and block numbers (the configured network: mainnet or a local fork). */
export const client = makeClient(RPCS);
/** TapeOut processor and factory reads (always public mainnet RPC; see env.ts). */
export const tapeClient = makeClient(TAPEOUT_RPCS);

// ---------- IndexedDB netlist cache (per viewer, best effort) ----------
const DB = 'miter';
const STORE = 'netlists';
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
let dbp: Promise<IDBDatabase | null> | null = null;
const idbStore: NetlistStore = {
  async get(key) {
    dbp ??= idb();
    const db = await dbp;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE).objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  },
  async set(key, v) {
    dbp ??= idb();
    const db = await dbp;
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, key);
    } catch {
      /* cache is a convenience */
    }
  },
};

/** Shared in-memory circuit cache for the session (REF deps included). */
export const circuitCache = new Map<string, Circuit>();

export async function getCircuit(cpu: Hex, id: bigint): Promise<Circuit> {
  const hit = circuitCache.get(circuitKey(cpu, id));
  if (hit) return hit;
  // Netlists can change while the factory is unsealed, so the persistent cache is only a
  // read accelerator; trust-critical paths (bounties) re-read hashes from chain.
  return (await loadCircuit(tapeClient, cpu, id, circuitCache, idbStore)).root;
}

export function depsOf(root: Circuit): Circuit[] {
  const out = new Map<string, Circuit>();
  const walk = (c: Circuit) => {
    for (const e of c.netlist.elements) {
      if (e.op !== 'ref') continue;
      const sub = circuitCache.get(circuitKey(e.cpu, e.id));
      if (sub && !out.has(sub.key)) {
        out.set(sub.key, sub);
        walk(sub);
      }
    }
  };
  walk(root);
  return [...out.values()];
}

export async function ownerOf(cpu: Hex, id: bigint): Promise<Hex | null> {
  try {
    return (await tapeClient.readContract({ address: cpu, abi: processorAbi, functionName: 'ownerOf', args: [id] })) as Hex;
  } catch {
    return null;
  }
}

// ---------- network stats ----------
export async function networkStats(): Promise<{ processors: number; circuits: number }> {
  const KEY = 'miter:stats:v1';
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Date.now() - v.at < 10 * 60_000) return v.data;
    }
  } catch { /* ignore */ }
  const n = Number(await tapeClient.readContract({ address: TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuCount' }));
  const cpus = (await Promise.all(
    Array.from({ length: n }, (_, i) => tapeClient.readContract({ address: TAPEOUT_FACTORY, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(i)] })),
  )) as Hex[];
  const next = await Promise.all(cpus.map((c) => tapeClient.readContract({ address: c, abi: processorAbi, functionName: 'nextId' })));
  const data = { processors: n, circuits: next.reduce((s, x) => s + Number(x) - 1, 0) };
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
  return data;
}

// ---------- MiterCourt ----------
export const STATE = ['None', 'Open', 'Paid', 'Voided', 'Withdrawn'] as const;
export type BountyState = (typeof STATE)[number];

export interface Bounty {
  id: bigint;
  funder: Hex;
  amount: bigint;
  target: Hex;
  targetId: bigint;
  spec: Hex;
  specId: bigint;
  targetHash: Hex;
  specHash: Hex;
  nIn: number;
  nOut: number;
  expiry: number;
  state: BountyState;
  hunter: Hex;
  openedBlock: bigint;
  settledBlock: bigint;
}

export const courtConfigured = () => Boolean(COURT);

export async function getBounty(id: bigint): Promise<Bounty> {
  const b = (await client.readContract({ address: COURT as Hex, abi: courtAbi, functionName: 'getBounty', args: [id] })) as any;
  return {
    id, funder: b.funder, amount: b.amount, target: b.target, targetId: BigInt(b.targetId), spec: b.spec,
    specId: BigInt(b.specId), targetHash: b.targetHash, specHash: b.specHash, nIn: Number(b.nIn), nOut: Number(b.nOut),
    expiry: Number(b.expiry), state: STATE[Number(b.state)], hunter: b.hunter,
    openedBlock: BigInt(b.openedBlock), settledBlock: BigInt(b.settledBlock),
  };
}

export async function listBounties(): Promise<Bounty[]> {
  if (!COURT) return [];
  const n = (await client.readContract({ address: COURT, abi: courtAbi, functionName: 'bountyCount' })) as bigint;
  const ids = Array.from({ length: Number(n) }, (_, i) => BigInt(Number(n) - i));
  return Promise.all(ids.map(getBounty));
}

export async function counterexampleOf(id: bigint): Promise<Hex | null> {
  const v = (await client.readContract({ address: COURT as Hex, abi: courtAbi, functionName: 'counterexampleOf', args: [id] })) as Hex;
  return v && v !== '0x' ? v : null;
}

/** Fetches one event of a bounty at the exact block the contract recorded (no indexer needed). */
export async function eventAt(eventName: 'BountyOpened' | 'Claimed' | 'Voided' | 'Withdrawn', id: bigint, block: bigint) {
  if (!block) return null;
  const logs = await client
    .getContractEvents({ address: COURT as Hex, abi: courtAbi, eventName, args: { id } as any, fromBlock: block, toBlock: block })
    .catch(() => []);
  return (logs as any[])[0] ?? null;
}

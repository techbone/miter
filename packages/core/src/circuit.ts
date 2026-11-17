import type { Hex, Netlist } from './netlist.js';

/** A loaded circuit: its netlist plus everything needed to evaluate it. */
export interface Circuit {
  key: string; // `${cpu}:${id}` (cpu lowercased)
  cpu: Hex;
  id: bigint;
  nIn: number;
  nOut: number;
  /** total state bits including REF sub-circuits (matches circuitInfo.nState) */
  nState: number;
  /** gate count reported by the processor (includes REF expansion) */
  gateCount: number;
  netlist: Netlist;
  netlistHash: Hex;
}

export const circuitKey = (cpu: string, id: bigint | number) => `${cpu.toLowerCase()}:${BigInt(id)}`;

/** Resolves a REF target. Loaders must have fetched every dependency first. */
export type Resolver = (cpu: Hex, id: bigint) => Circuit;

export function mapResolver(map: Map<string, Circuit>): Resolver {
  return (cpu, id) => {
    const c = map.get(circuitKey(cpu, id));
    if (!c) throw new Error(`unresolved REF ${cpu}:${id}`);
    return c;
  };
}

/** State layout per TAP-02 §4: each LATCH takes one bit, each REF a block of its sub-circuit's nState. */
export function stateLayout(c: Circuit, resolve: Resolver): number[] {
  const offsets: number[] = [];
  let off = 0;
  for (const e of c.netlist.elements) {
    offsets.push(off);
    if (e.op === 'latch') off += 1;
    else if (e.op === 'ref') off += resolve(e.cpu, e.id).nState;
  }
  return offsets;
}

export function computeNState(nl: Netlist, resolve: Resolver): number {
  let n = 0;
  for (const e of nl.elements) {
    if (e.op === 'latch') n += 1;
    else if (e.op === 'ref') n += resolve(e.cpu, e.id).nState;
  }
  return n;
}

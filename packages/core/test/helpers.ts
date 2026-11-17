import { keccak256 } from 'viem';
import { NetlistBuilder } from '../src/builder.js';
import { bytesToHex, type Hex } from '../src/netlist.js';
import { circuitKey, computeNState, mapResolver, type Circuit } from '../src/circuit.js';

export const FAKE_CPU: Hex = '0x00000000000000000000000000000000000000c1';

/** Registers a built netlist as a fake on-chain circuit in `map`. */
export function register(map: Map<string, Circuit>, id: bigint, b: ReturnType<NetlistBuilder['build']>, cpu: Hex = FAKE_CPU): Circuit {
  const resolve = mapResolver(map);
  const c: Circuit = {
    key: circuitKey(cpu, id), cpu, id, nIn: b.nIn, nOut: b.nOut,
    nState: computeNState(b.netlist, resolve),
    gateCount: b.netlist.elements.length, netlist: b.netlist,
    netlistHash: keccak256(bytesToHex(b.bytes)),
  };
  map.set(c.key, c);
  return c;
}

/** n-bit ripple-carry adder: inputs a[0..n), b[0..n); outputs sum[0..n), carry. */
export function rippleAdder(n: number, bug?: { bit: number }) {
  const B = new NetlistBuilder(2 * n);
  let carry = B.zero;
  const sum: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = B.input(i), b = B.input(n + i);
    let [s, c] = B.fullAdder(a, b, carry);
    // injected bug: on one bit, carry-out ignores the incoming carry (c = a & b)
    if (bug?.bit === i) c = B.and(a, b);
    sum.push(s);
    carry = c;
  }
  return B.build([...sum, carry]);
}

export const toNum = (bits: Uint8Array | number[], from = 0, n = bits.length) => {
  let v = 0;
  for (let i = 0; i < n; i++) v |= (bits[from + i] ? 1 : 0) << i;
  return v;
};

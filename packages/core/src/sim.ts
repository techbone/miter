import { packBits, unpackBits } from './netlist.js';
import { stateLayout, type Circuit, type Resolver } from './circuit.js';

export interface BeatResult {
  newState: Uint8Array; // bits
  outputs: Uint8Array; // bits
}

const layoutCache = new WeakMap<Circuit, number[]>();

/**
 * One beat (TAP-02 §4), on unpacked bits.
 * NAND = 1 - (a & b); LATCH outputs its previous state bit; REF runs one beat of
 * the sub-circuit on its own state block. LATCH new state = s[d] after the full pass.
 */
export function beatBits(c: Circuit, state: Uint8Array, inputs: Uint8Array, resolve: Resolver): BeatResult {
  const nl = c.netlist;
  let layout = layoutCache.get(c);
  if (!layout) {
    layout = stateLayout(c, resolve);
    layoutCache.set(c, layout);
  }
  const s = new Uint8Array(nl.nSignals);
  s[1] = 1;
  for (let i = 0; i < nl.nIn; i++) s[2 + i] = inputs[i] ?? 0;
  const newState = new Uint8Array(c.nState);
  const els = nl.elements;
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    const o = nl.firstOut[i];
    if (e.op === 'nand') {
      s[o] = 1 - (s[e.a] & s[e.b]);
    } else if (e.op === 'latch') {
      s[o] = state[layout[i]] ?? 0;
    } else {
      const sub = resolve(e.cpu, e.id);
      const off = layout[i];
      const subIn = new Uint8Array(e.nIns);
      for (let k = 0; k < e.nIns; k++) subIn[k] = s[e.ins[k]];
      const r = beatBits(sub, state.subarray(off, off + sub.nState), subIn, resolve);
      for (let k = 0; k < e.nOuts; k++) s[o + k] = r.outputs[k];
      newState.set(r.newState, off);
    }
  }
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.op === 'latch') newState[layout[i]] = s[e.d];
  }
  const outputs = s.slice(nl.nSignals - nl.nOut);
  return { newState, outputs };
}

/** Byte-level beat matching the processor's `step(id, state, inputs)`. */
export function step(c: Circuit, state: Uint8Array, inputs: Uint8Array, resolve: Resolver) {
  const r = beatBits(c, unpackBits(state, c.nState), unpackBits(inputs, c.nIn), resolve);
  return { newState: packBits(r.newState), outputs: packBits(r.outputs) };
}

/** Byte-level evaluation matching the processor's `eval(id, inputs)` (combinational circuits). */
export function evaluate(c: Circuit, inputs: Uint8Array, resolve: Resolver): Uint8Array {
  if (c.nState > 0) throw new Error('has latch: use step');
  return step(c, new Uint8Array(0), inputs, resolve).outputs;
}

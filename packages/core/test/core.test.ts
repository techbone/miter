import { describe, expect, it } from 'vitest';
import { NetlistBuilder } from '../src/builder.js';
import { mapResolver, type Circuit } from '../src/circuit.js';
import { buildEquivalenceMiter } from '../src/cnf.js';
import { NetlistError, packBits, parseNetlist, serializeNetlist, unpackBits } from '../src/netlist.js';
import { beatBits, evaluate, step } from '../src/sim.js';
import { runMiter } from '../src/solve.js';
import { FAKE_CPU, register, rippleAdder, toNum } from './helpers.js';

describe('TAP-02 netlist format', () => {
  it('round-trips NAND, LATCH and REF records byte for byte', () => {
    const B = new NetlistBuilder(3);
    const x = B.nand(B.input(0), B.input(1));
    const l = B.latch();
    l.setD(x);
    const [r0, r1] = B.ref('0x00000000000000000000000000000000000000aa', 7n, [x, l.q, B.input(2)], 2);
    const built = B.build([r0, r1]);
    const again = serializeNetlist(parseNetlist(built.bytes, 3, 2));
    expect(Array.from(again)).toEqual(Array.from(built.bytes));
    const ref = built.netlist.elements.find((e) => e.op === 'ref')!;
    expect(ref).toMatchObject({ op: 'ref', id: 7n, nIns: 3, nOuts: 2 });
  });

  it('rejects forward NAND references and unknown opcodes', () => {
    expect(() => parseNetlist(Uint8Array.from([0x00, 0, 0, 9, 0, 0, 2]), 1, 1)).toThrow(NetlistError);
    expect(() => parseNetlist(Uint8Array.from([0x07]), 1, 1)).toThrow(/unknown opcode/);
  });

  it('packs bits LSB-first with exact output length', () => {
    expect(Array.from(packBits([1, 0, 0, 0, 0, 0, 0, 0, 1]))).toEqual([1, 1]);
    expect(Array.from(unpackBits(Uint8Array.from([0b101]), 4))).toEqual([1, 0, 1, 0]);
    expect(Array.from(unpackBits(new Uint8Array(0), 3))).toEqual([0, 0, 0]); // lenient: missing bytes read 0
  });
});

describe('simulator', () => {
  it('computes a 4-bit adder exhaustively', () => {
    const map = new Map<string, Circuit>();
    const add = register(map, 1n, rippleAdder(4));
    const resolve = mapResolver(map);
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        const out = unpackBits(evaluate(add, packBits([...unpackBits(Uint8Array.of(a), 4), ...unpackBits(Uint8Array.of(b), 4)]), resolve), 5);
        expect(toNum(out)).toBe(a + b);
      }
  });

  it('LATCH outputs the previous state and stores s[d] after the pass (toggle flip-flop)', () => {
    const B = new NetlistBuilder(1); // input: enable
    const l = B.latch();
    const nxt = B.xor(l.q, B.input(0));
    l.setD(nxt);
    const map = new Map<string, Circuit>();
    const t = register(map, 1n, B.build([l.q]));
    const resolve = mapResolver(map);
    expect(t.nState).toBe(1);
    let state = Uint8Array.of(0);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = beatBits(t, state, Uint8Array.of(1), resolve);
      seen.push(r.outputs[0]);
      state = r.newState;
    }
    expect(seen).toEqual([0, 1, 0, 1]);
    expect(() => evaluate(t, Uint8Array.of(1), resolve)).toThrow(/use step/);
  });

  it('runs REF sub-circuits, including their state blocks', () => {
    const map = new Map<string, Circuit>();
    register(map, 1n, rippleAdder(2));
    const B = new NetlistBuilder(4);
    const outs = B.ref(FAKE_CPU, 1n, B.inputs(0, 4), 3);
    const top = register(map, 2n, B.build(outs));
    const resolve = mapResolver(map);
    // 3 + 2 = 5
    const out = evaluate(top, packBits([1, 1, 0, 1]), resolve);
    expect(toNum(unpackBits(out, 3))).toBe(5);

    // stateful sub-circuit inside a REF: the parent's state block carries it
    const T = new NetlistBuilder(1);
    const l = T.latch();
    l.setD(T.xor(l.q, T.input(0)));
    register(map, 3n, T.build([l.q]));
    const P = new NetlistBuilder(1);
    const [q] = P.ref(FAKE_CPU, 3n, [P.input(0)], 1);
    const parent = register(map, 4n, P.build([q]));
    expect(parent.nState).toBe(1);
    const r1 = step(parent, Uint8Array.of(0), Uint8Array.of(1), resolve);
    const r2 = step(parent, r1.newState, Uint8Array.of(1), resolve);
    expect([r1.outputs[0], r2.outputs[0]]).toEqual([0, 1]);
  });
});

describe('equivalence miter', () => {
  it('proves two structurally different adders equivalent', () => {
    const map = new Map<string, Circuit>();
    const a = register(map, 1n, rippleAdder(8));
    // same function, different structure: carry = (a&b)|(c&(a^b)) built from AND/OR
    const B = new NetlistBuilder(16);
    let c = B.zero; const sum: number[] = [];
    for (let i = 0; i < 8; i++) {
      const x = B.input(i), y = B.input(8 + i);
      const axb = B.xor(x, y);
      sum.push(B.xor(axb, c));
      c = B.or(B.and(x, y), B.and(c, axb));
    }
    const b = register(map, 2n, B.build([...sum, c]));
    const v = runMiter(buildEquivalenceMiter(a, b, mapResolver(map)));
    expect(v.kind).toBe('equivalent');
  });

  it('collapses identical copies structurally without calling the solver', () => {
    const map = new Map<string, Circuit>();
    const a = register(map, 1n, rippleAdder(16));
    const b = register(map, 2n, rippleAdder(16));
    const v = runMiter(buildEquivalenceMiter(a, b, mapResolver(map)));
    expect(v).toMatchObject({ kind: 'equivalent', how: 'structural' });
  });

  it('finds a counterexample to an injected carry bug, and the simulator confirms it', () => {
    const map = new Map<string, Circuit>();
    const good = register(map, 1n, rippleAdder(16));
    const bad = register(map, 2n, rippleAdder(16, { bit: 9 }));
    const resolve = mapResolver(map);
    const v = runMiter(buildEquivalenceMiter(bad, good, resolve));
    expect(v.kind).toBe('counterexample');
    if (v.kind !== 'counterexample') return;
    const o1 = evaluate(bad, v.input, resolve);
    const o2 = evaluate(good, v.input, resolve);
    expect(Array.from(o1)).not.toEqual(Array.from(o2));
  });
});

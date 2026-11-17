import { parseNetlist, serializeNetlist, type Element, type Hex, type Netlist } from './netlist.js';

/**
 * Builds TAP-02 netlists from NAND/LATCH primitives. Signals are plain numbers.
 * `build(outputs)` guarantees the outputs are the last nOut signals and come from
 * elements, appending double-NAND buffers only where needed.
 */
export class NetlistBuilder {
  readonly elements: Element[] = [];
  private next: number;
  private latchPatches: Array<{ el: { op: 'latch'; d: number } }> = [];

  constructor(readonly nIn: number) {
    this.next = 2 + nIn;
  }
  get zero() { return 0; }
  get one() { return 1; }
  input(i: number) {
    if (i < 0 || i >= this.nIn) throw new Error(`input ${i} out of range`);
    return 2 + i;
  }
  inputs(from: number, n: number) { return Array.from({ length: n }, (_, k) => this.input(from + k)); }

  nand(a: number, b: number) { this.elements.push({ op: 'nand', a, b }); return this.next++; }
  not(a: number) { return this.nand(a, a); }
  and(a: number, b: number) { return this.not(this.nand(a, b)); }
  or(a: number, b: number) { return this.nand(this.not(a), this.not(b)); }
  xor(a: number, b: number) { const n = this.nand(a, b); return this.nand(this.nand(a, n), this.nand(b, n)); }
  buf(a: number) { return this.not(this.not(a)); }

  /** A latch whose `d` input is wired later via `setD` (LATCH d may point forward). */
  latch(): { q: number; setD: (d: number) => void } {
    const el = { op: 'latch' as const, d: 0 };
    this.elements.push(el);
    const q = this.next++;
    this.latchPatches.push({ el });
    return { q, setD: (d: number) => { el.d = d; } };
  }

  ref(cpu: Hex, id: bigint, ins: number[], nOuts: number): number[] {
    this.elements.push({ op: 'ref', cpu, id, nIns: ins.length, nOuts, ins });
    const first = this.next;
    this.next += nOuts;
    return Array.from({ length: nOuts }, (_, k) => first + k);
  }

  /** Full adder: returns [sum, carry]. 9 NANDs. */
  fullAdder(a: number, b: number, c: number): [number, number] {
    const n1 = this.nand(a, b);
    const n2 = this.nand(a, n1), n3 = this.nand(b, n1);
    const x = this.nand(n2, n3); // a ^ b
    const n4 = this.nand(x, c);
    const n5 = this.nand(x, n4), n6 = this.nand(c, n4);
    const sum = this.nand(n5, n6);
    const carry = this.nand(n1, n4);
    return [sum, carry];
  }

  build(outputs: number[]): { netlist: Netlist; bytes: Uint8Array; nIn: number; nOut: number } {
    const firstEl = 2 + this.nIn;
    const tailStart = this.next - outputs.length;
    const alreadyTail = tailStart >= firstEl && outputs.every((o, k) => o === tailStart + k);
    if (!alreadyTail) {
      const buffered = outputs.map((o) => this.not(o)); // first inverter
      for (const b of buffered) this.not(b); // second inverter, contiguous at the tail
    }
    const bytes = serializeNetlist({ elements: this.elements });
    const netlist = parseNetlist(bytes, this.nIn, outputs.length);
    return { netlist, bytes, nIn: this.nIn, nOut: outputs.length };
  }
}

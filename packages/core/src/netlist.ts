/**
 * TAP-02 netlist format: parse, serialize and validate.
 *
 * Records (no header, big-endian, u24 signal indices):
 *   0x00 NAND  a:u24 b:u24                                   7 bytes, 1 output
 *   0x01 LATCH d:u24                                         4 bytes, 1 output
 *   0x02 REF   cpu:20 id:u64 nIns:u8 nOuts:u8 ins:u24*nIns   31 + 3*nIns bytes, nOuts outputs
 *
 * Signals: 0 = const 0, 1 = const 1, 2..2+nIn-1 = inputs, then element outputs
 * in record order. Circuit outputs are the last nOut signals.
 */

export type Hex = `0x${string}`;

export type Element =
  | { op: 'nand'; a: number; b: number }
  | { op: 'latch'; d: number }
  | { op: 'ref'; cpu: Hex; id: bigint; nIns: number; nOuts: number; ins: number[] };

export interface Netlist {
  nIn: number;
  nOut: number;
  elements: Element[];
  /** first output signal index of each element */
  firstOut: number[];
  /** total number of signals (2 + nIn + all element outputs) */
  nSignals: number;
}

export class NetlistError extends Error {}

const OP_NAND = 0x00;
const OP_LATCH = 0x01;
const OP_REF = 0x02;

function u24(b: Uint8Array, o: number): number {
  return (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
}

function toHexAddr(b: Uint8Array, o: number): Hex {
  let s = '0x';
  for (let i = 0; i < 20; i++) s += b[o + i].toString(16).padStart(2, '0');
  return s as Hex;
}

export function parseNetlist(bytes: Uint8Array, nIn: number, nOut: number): Netlist {
  const elements: Element[] = [];
  const firstOut: number[] = [];
  let sig = 2 + nIn;
  let o = 0;
  while (o < bytes.length) {
    const op = bytes[o];
    if (op === OP_NAND) {
      if (o + 7 > bytes.length) throw new NetlistError(`truncated NAND at byte ${o}`);
      elements.push({ op: 'nand', a: u24(bytes, o + 1), b: u24(bytes, o + 4) });
      firstOut.push(sig);
      sig += 1;
      o += 7;
    } else if (op === OP_LATCH) {
      if (o + 4 > bytes.length) throw new NetlistError(`truncated LATCH at byte ${o}`);
      elements.push({ op: 'latch', d: u24(bytes, o + 1) });
      firstOut.push(sig);
      sig += 1;
      o += 4;
    } else if (op === OP_REF) {
      if (o + 31 > bytes.length) throw new NetlistError(`truncated REF at byte ${o}`);
      const cpu = toHexAddr(bytes, o + 1);
      let id = 0n;
      for (let i = 0; i < 8; i++) id = (id << 8n) | BigInt(bytes[o + 21 + i]);
      const nIns = bytes[o + 29];
      const nOuts = bytes[o + 30];
      const len = 31 + 3 * nIns;
      if (o + len > bytes.length) throw new NetlistError(`truncated REF ins at byte ${o}`);
      const ins: number[] = [];
      for (let i = 0; i < nIns; i++) ins.push(u24(bytes, o + 31 + 3 * i));
      elements.push({ op: 'ref', cpu, id, nIns, nOuts, ins });
      firstOut.push(sig);
      sig += nOuts;
      o += len;
    } else {
      throw new NetlistError(`unknown opcode 0x${op.toString(16)} at byte ${o}`);
    }
  }
  const nl: Netlist = { nIn, nOut, elements, firstOut, nSignals: sig };
  validate(nl);
  return nl;
}

/** Structural checks from TAP-02 §3 (REF pin counts are checked by the loader). */
export function validate(nl: Netlist): void {
  const { elements, firstOut, nSignals, nOut, nIn } = nl;
  if (nOut < 1) throw new NetlistError('nOut must be >= 1');
  if (nSignals - (2 + nIn) < nOut) throw new NetlistError('outputs must come from elements');
  elements.forEach((e, i) => {
    const f = firstOut[i];
    if (e.op === 'nand') {
      if (e.a >= f || e.b >= f) throw new NetlistError(`NAND #${i} refers forward`);
    } else if (e.op === 'latch') {
      if (e.d >= nSignals) throw new NetlistError(`LATCH #${i} d out of range`);
    } else {
      for (const s of e.ins) if (s >= f) throw new NetlistError(`REF #${i} refers forward`);
    }
  });
}

export function serializeNetlist(nl: Pick<Netlist, 'elements'>): Uint8Array {
  const out: number[] = [];
  const push24 = (v: number) => out.push((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  for (const e of nl.elements) {
    if (e.op === 'nand') {
      out.push(OP_NAND);
      push24(e.a);
      push24(e.b);
    } else if (e.op === 'latch') {
      out.push(OP_LATCH);
      push24(e.d);
    } else {
      out.push(OP_REF);
      const addr = e.cpu.slice(2).padStart(40, '0');
      for (let i = 0; i < 20; i++) out.push(parseInt(addr.slice(2 * i, 2 * i + 2), 16));
      for (let i = 7; i >= 0; i--) out.push(Number((e.id >> BigInt(8 * i)) & 0xffn));
      out.push(e.nIns, e.nOuts);
      for (const s of e.ins) push24(s);
    }
  }
  return Uint8Array.from(out);
}

/** Counts top-level elements by kind. */
export function stats(nl: Netlist) {
  let nand = 0, latch = 0, ref = 0;
  for (const e of nl.elements) {
    if (e.op === 'nand') nand++;
    else if (e.op === 'latch') latch++;
    else ref++;
  }
  return { nand, latch, ref };
}

// ---- bit packing (LSB-first, TAP-02 §5) ----

export function unpackBits(bytes: Uint8Array, n: number): Uint8Array {
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const byte = bytes[i >> 3];
    bits[i] = byte === undefined ? 0 : (byte >> (i & 7)) & 1;
  }
  return bits;
}

export function packBits(bits: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): Hex {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s as Hex;
}

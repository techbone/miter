import { stateLayout, type Circuit, type Resolver } from './circuit.js';

/**
 * CNF builder with literal-level constant folding and structural hashing
 * (AIG-style "strash"): identical NANDs over identical literals share one
 * variable, so two copies of the same logic collapse before the solver runs.
 *
 * Literals are DIMACS-style signed ints. `T` is a variable forced true;
 * the constant-false literal is `-T`.
 */
export class Cnf {
  nVars = 0;
  clauses: number[][] = [];
  readonly T: number;
  private strash = new Map<string, number>();
  private xstrash = new Map<string, number>();
  nands = 0; // NANDs that needed a fresh variable

  constructor() {
    this.T = this.newVar();
    this.clauses.push([this.T]);
  }
  get F() { return -this.T; }
  newVar() { return ++this.nVars; }
  add(lits: number[]) { this.clauses.push(lits); }

  nand(a: number, b: number): number {
    const { T, F } = this;
    if (a === F || b === F) return T;
    if (a === T) return -b;
    if (b === T) return -a;
    if (a === b) return -a;
    if (a === -b) return T;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const hit = this.strash.get(key);
    if (hit !== undefined) return hit;
    const o = this.newVar();
    this.nands++;
    // o <-> !(a & b)
    this.clauses.push([o, a], [o, b], [-o, -a, -b]);
    this.strash.set(key, o);
    return o;
  }

  xor(a: number, b: number): number {
    const { T, F } = this;
    if (a === b) return F;
    if (a === -b) return T;
    if (a === F) return b;
    if (b === F) return a;
    if (a === T) return -b;
    if (b === T) return -a;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const hit = this.xstrash.get(key);
    if (hit !== undefined) return hit;
    const d = this.newVar();
    this.clauses.push([-d, a, b], [-d, -a, -b], [d, -a, b], [d, a, -b]);
    this.xstrash.set(key, d);
    return d;
  }

  /** Adds the clause OR(lits) after folding constants. Returns false if it is trivially unsatisfiable. */
  any(lits: number[]): 'sat-trivial' | 'unsat-trivial' | 'added' {
    const live = lits.filter((l) => l !== this.F);
    if (live.includes(this.T)) return 'sat-trivial';
    if (live.length === 0) return 'unsat-trivial';
    this.clauses.push(live);
    return 'added';
  }
}

/**
 * Encodes one beat of `c` into `cnf`: given literals for inputs and state bits,
 * returns literals for outputs and next-state bits. REFs are inlined recursively.
 */
export function encodeBeat(
  cnf: Cnf,
  c: Circuit,
  inputs: number[],
  state: number[],
  resolve: Resolver,
): { outputs: number[]; nextState: number[] } {
  const nl = c.netlist;
  const layout = stateLayout(c, resolve);
  const s = new Array<number>(nl.nSignals);
  s[0] = cnf.F;
  s[1] = cnf.T;
  for (let i = 0; i < nl.nIn; i++) s[2 + i] = inputs[i];
  const nextState = new Array<number>(c.nState).fill(cnf.F);
  nl.elements.forEach((e, i) => {
    const o = nl.firstOut[i];
    if (e.op === 'nand') s[o] = cnf.nand(s[e.a], s[e.b]);
    else if (e.op === 'latch') s[o] = state[layout[i]];
    else {
      const sub = resolve(e.cpu, e.id);
      const off = layout[i];
      const r = encodeBeat(cnf, sub, e.ins.map((x) => s[x]), state.slice(off, off + sub.nState), resolve);
      for (let k = 0; k < e.nOuts; k++) s[o + k] = r.outputs[k];
      for (let k = 0; k < sub.nState; k++) nextState[off + k] = r.nextState[k];
    }
  });
  nl.elements.forEach((e, i) => {
    if (e.op === 'latch') nextState[layout[i]] = s[e.d];
  });
  return { outputs: s.slice(nl.nSignals - nl.nOut), nextState };
}

export interface MiterProblem {
  cnf: Cnf;
  inputVars: number[];
  /** 'sat-trivial' = every input is a counterexample; 'unsat-trivial' = structurally identical */
  shortcut?: 'sat-trivial' | 'unsat-trivial';
  stats: { vars: number; clauses: number; nands: number; differingOutputs: number };
}

/**
 * Equivalence miter for combinational circuits: shared inputs, XOR each output
 * pair, require at least one XOR to be 1. SAT ⇒ counterexample; UNSAT ⇒ equivalent.
 */
export function buildEquivalenceMiter(target: Circuit, spec: Circuit, resolve: Resolver): MiterProblem {
  if (target.nIn !== spec.nIn || target.nOut !== spec.nOut) {
    throw new Error(`pin mismatch: target ${target.nIn}→${target.nOut}, spec ${spec.nIn}→${spec.nOut}`);
  }
  if (target.nState || spec.nState) throw new Error('stateful circuits need bounded unrolling (M3)');
  const cnf = new Cnf();
  const inputVars = Array.from({ length: target.nIn }, () => cnf.newVar());
  const a = encodeBeat(cnf, target, inputVars, [], resolve).outputs;
  const b = encodeBeat(cnf, spec, inputVars, [], resolve).outputs;
  const diffs = a.map((x, i) => cnf.xor(x, b[i]));
  const r = cnf.any(diffs);
  return {
    cnf,
    inputVars,
    shortcut: r === 'added' ? undefined : r,
    stats: { vars: cnf.nVars, clauses: cnf.clauses.length, nands: cnf.nands, differingOutputs: diffs.filter((d) => d !== cnf.F).length },
  };
}

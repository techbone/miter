// MiniSat (Meteor's emscripten build, MIT) via its thin wrapper. CommonJS module.
// @ts-ignore - no types shipped
import MiniSatCjs from 'logic-solver/minisat_wrapper.js';
import { packBits } from './netlist.js';
import type { Cnf, MiterProblem } from './cnf.js';

const MiniSat: any = (MiniSatCjs as any).default ?? MiniSatCjs;

export type SolveResult =
  | { sat: true; model: Uint8Array; ms: number }
  | { sat: false; ms: number };

/** Solves a CNF. `model[v]` is 1 if variable v is true. */
export function solveCnf(cnf: Cnf): SolveResult {
  const t0 = performance.now();
  const m = new MiniSat();
  m.ensureVar(cnf.nVars);
  for (const cl of cnf.clauses) {
    if (!m.addClause(cl)) return { sat: false, ms: performance.now() - t0 };
  }
  if (!m.solve()) return { sat: false, ms: performance.now() - t0 };
  const sol: (boolean | null)[] = m.getSolution();
  const model = new Uint8Array(cnf.nVars + 1);
  for (let v = 1; v <= cnf.nVars; v++) model[v] = sol[v] ? 1 : 0;
  return { sat: true, model, ms: performance.now() - t0 };
}

export type MiterVerdict =
  | { kind: 'counterexample'; input: Uint8Array; ms: number; stats: MiterProblem['stats'] }
  | { kind: 'equivalent'; ms: number; stats: MiterProblem['stats']; how: 'structural' | 'sat' };

/** Runs a miter. A counterexample is returned as packed input bytes (LSB-first). */
export function runMiter(p: MiterProblem): MiterVerdict {
  if (p.shortcut === 'unsat-trivial') return { kind: 'equivalent', ms: 0, stats: p.stats, how: 'structural' };
  if (p.shortcut === 'sat-trivial') {
    return { kind: 'counterexample', input: new Uint8Array(Math.ceil(p.inputVars.length / 8)), ms: 0, stats: p.stats };
  }
  const r = solveCnf(p.cnf);
  if (!r.sat) return { kind: 'equivalent', ms: r.ms, stats: p.stats, how: 'sat' };
  const bits = p.inputVars.map((v) => r.model[v]);
  return { kind: 'counterexample', input: packBits(bits), ms: r.ms, stats: p.stats };
}

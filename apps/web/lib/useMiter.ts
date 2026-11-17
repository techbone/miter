'use client';
import { useCallback, useState } from 'react';
import { bytesToHex, evaluate, evalOnChain, mapResolver, type Circuit, type Hex, type MiterVerdict } from '@miter/core';
import { circuitCache, depsOf, getCircuit, tapeClient } from './chain';
import { solveInWorker } from './solver';
import type { StepItem } from '@/components/ui';

export interface CircuitAddr { cpu: Hex; id: bigint }

export function parseRef(s: string): CircuitAddr | null {
  const m = s.trim().match(/^(0x[0-9a-fA-F]{40})\s*[:#/ ]\s*(\d+)$/);
  return m ? { cpu: m[1] as Hex, id: BigInt(m[2]) } : null;
}

export interface MiterOutcome {
  target: Circuit;
  spec: Circuit;
  verdict: MiterVerdict;
  /** for counterexamples: outputs as returned by the live processors */
  targetOut?: Hex;
  specOut?: Hex;
  input?: Hex;
}

const KEYS = ['load', 'verify', 'solve', 'confirm'] as const;
const LABELS: Record<(typeof KEYS)[number], string> = {
  load: 'Load both netlists from X Layer',
  verify: 'Check our simulator against the processors',
  solve: 'Search every input with MiniSat',
  confirm: 'Confirm the result on the live processors',
};
const initial = (): StepItem[] => KEYS.map((k) => ({ key: k, label: LABELS[k], state: 'idle' }));

function vectors(nIn: number, max = 8): Uint8Array[] {
  const n = Math.ceil(nIn / 8);
  if (nIn <= 3) return Array.from({ length: 2 ** nIn }, (_, x) => Uint8Array.of(x));
  return Array.from({ length: max }, () => crypto.getRandomValues(new Uint8Array(n)));
}

export function useMiter() {
  const [steps, setSteps] = useState<StepItem[]>(initial);
  const [outcome, setOutcome] = useState<MiterOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const set = (key: string, patch: Partial<StepItem>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const run = useCallback(async (t: CircuitAddr, s: CircuitAddr): Promise<MiterOutcome | null> => {
    setSteps(initial());
    setOutcome(null);
    setError(null);
    setRunning(true);
    let current = 'load';
    try {
      set('load', { state: 'active' });
      const [target, spec] = await Promise.all([getCircuit(t.cpu, t.id), getCircuit(s.cpu, s.id)]);
      const deps = new Set([...depsOf(target), ...depsOf(spec)].map((c) => c.key)).size;
      set('load', {
        state: 'done',
        detail: `target ${target.nIn}→${target.nOut}, ${target.gateCount} gates · spec ${spec.nIn}→${spec.nOut}, ${spec.gateCount} gates${deps ? ` · ${deps} referenced circuits` : ''}`,
      });
      if (target.nIn !== spec.nIn || target.nOut !== spec.nOut)
        throw new Error(`Pin counts differ (${target.nIn}→${target.nOut} vs ${spec.nIn}→${spec.nOut}), so these circuits can't be compared.`);
      if (target.nState || spec.nState)
        throw new Error('One of these circuits has LATCH state. Stateful bounties arrive in M3 (bounded unrolling via step).');

      current = 'verify';
      set('verify', { state: 'active' });
      const resolve = mapResolver(circuitCache);
      const vs = vectors(target.nIn);
      let n = 0;
      for (const v of vs) {
        for (const c of [target, spec]) {
          const [mine, theirs] = [evaluate(c, v, resolve), await evalOnChain(tapeClient, c.cpu, c.id, v)];
          if (bytesToHex(mine) !== bytesToHex(theirs)) throw new Error(`Simulator disagrees with ${c.key} on input ${bytesToHex(v)}. Refusing to trust the solver.`);
          n++;
        }
      }
      set('verify', { state: 'done', detail: `${n}/${n} evaluations match eval() on the processors` });

      current = 'solve';
      set('solve', { state: 'active', detail: 'running in a Web Worker' });
      const { verdict, encodeMs } = await solveInWorker(target, spec);
      const cnf = `${verdict.stats.vars.toLocaleString()} vars · ${verdict.stats.clauses.toLocaleString()} clauses`;
      if (verdict.kind === 'equivalent') {
        set('solve', {
          state: 'done',
          detail: verdict.how === 'structural'
            ? `Structurally identical after hashing (${cnf}); no input can separate them`
            : `UNSAT in ${(verdict.ms + encodeMs).toFixed(1)} ms (${cnf}); no input can separate them`,
        });
        set('confirm', { state: 'skipped', detail: 'Nothing to confirm: the circuits are equivalent' });
        const o = { target, spec, verdict };
        setOutcome(o);
        return o;
      }
      set('solve', { state: 'done', detail: `Counterexample in ${(verdict.ms + encodeMs).toFixed(1)} ms (${cnf})` });

      current = 'confirm';
      set('confirm', { state: 'active' });
      const [to, so] = await Promise.all([evalOnChain(tapeClient, target.cpu, target.id, verdict.input), evalOnChain(tapeClient, spec.cpu, spec.id, verdict.input)]);
      if (bytesToHex(to) === bytesToHex(so)) throw new Error('The processors agree on the solver input. This should never happen; please report it.');
      const o: MiterOutcome = { target, spec, verdict, input: bytesToHex(verdict.input), targetOut: bytesToHex(to), specOut: bytesToHex(so) };
      set('confirm', { state: 'done', detail: `eval() returns ${o.targetOut} vs ${o.specOut}` });
      setOutcome(o);
      return o;
    } catch (e: any) {
      set(current, { state: 'error', detail: e?.shortMessage ?? e?.message ?? String(e) });
      setError(e?.shortMessage ?? e?.message ?? String(e));
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { steps, outcome, error, running, run };
}

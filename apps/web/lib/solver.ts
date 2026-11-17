'use client';
import type { Circuit, MiterVerdict } from '@miter/core';
import { depsOf } from './chain';

export interface SolveOutcome {
  verdict: MiterVerdict;
  encodeMs: number;
}

/** Runs the equivalence miter in a Web Worker so MiniSat never blocks the UI. */
export function solveInWorker(target: Circuit, spec: Circuit, timeoutMs = 60_000): Promise<SolveOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Solver stopped after ${timeoutMs / 1000}s without an answer.`));
    }, timeoutMs);
    worker.onmessage = (ev) => {
      clearTimeout(timer);
      worker.terminate();
      if (ev.data.ok) resolve({ verdict: ev.data.verdict, encodeMs: ev.data.encodeMs });
      else reject(new Error(ev.data.error));
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || 'Solver worker crashed.'));
    };
    const deps = [...new Map([...depsOf(target), ...depsOf(spec)].map((c) => [c.key, c])).values()];
    worker.postMessage({ target, spec, deps });
  });
}

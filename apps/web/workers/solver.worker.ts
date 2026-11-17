/// <reference lib="webworker" />
import { buildEquivalenceMiter, mapResolver, runMiter, type Circuit } from '@miter/core';

export interface SolveRequest {
  target: Circuit;
  spec: Circuit;
  deps: Circuit[];
}

self.onmessage = (ev: MessageEvent<SolveRequest>) => {
  try {
    const { target, spec, deps } = ev.data;
    const map = new Map<string, Circuit>();
    for (const c of [...deps, target, spec]) map.set(c.key, c);
    const t0 = performance.now();
    const problem = buildEquivalenceMiter(target, spec, mapResolver(map));
    const encodeMs = performance.now() - t0;
    const verdict = runMiter(problem);
    (self as any).postMessage({ ok: true, verdict, encodeMs });
  } catch (e: any) {
    (self as any).postMessage({ ok: false, error: e?.message ?? String(e) });
  }
};

'use client';
import { BitStrip, CircuitRef, Pill } from './ui';
import type { MiterOutcome } from '@/lib/useMiter';
import { inputSpace } from '@/lib/format';

/** Renders a miter result: the breaking input and both outputs, or the equivalence verdict. */
export function OutcomeCard({ o }: { o: MiterOutcome }) {
  const { target, spec, verdict } = o;
  if (verdict.kind === 'equivalent') {
    return (
      <div className="card flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          <Pill status="Equivalent" />
          <span className="text-sm text-muted">{verdict.how === 'structural' ? 'proved by structural hashing' : 'proved by MiniSat (UNSAT)'}</span>
        </div>
        <p className="text-md">
          No input separates <CircuitRef cpu={target.cpu} id={target.id} /> from <CircuitRef cpu={spec.cpu} id={spec.id} />. All {inputSpace(target.nIn)} inputs give the same output.
        </p>
      </div>
    );
  }
  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill status="Broken" label="Counterexample" />
        <span className="text-sm text-muted">The live processors disagree on this input, so the contract can check it by itself.</span>
      </div>
      <BitStrip label="Input" sub={`${target.nIn} bits · ${o.input}`} hex={o.input!} n={target.nIn} />
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <BitStrip label="Target out" sub={<CircuitRef cpu={target.cpu} id={target.id} className="text-xs" />} hex={o.targetOut!} n={target.nOut} against={o.specOut} />
        <BitStrip label="Spec out" sub={<CircuitRef cpu={spec.cpu} id={spec.id} className="text-xs" />} hex={o.specOut!} n={spec.nOut} against={o.targetOut} />
      </div>
    </div>
  );
}

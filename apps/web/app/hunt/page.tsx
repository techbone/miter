'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Play } from 'lucide-react';
import { OutcomeCard } from '@/components/outcome';
import { Notice, Steps } from '@/components/ui';
import { parseRef, useMiter } from '@/lib/useMiter';

const PRESETS = [
  {
    label: 'AND vs NAND',
    note: 'complements: every input breaks them',
    target: '0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6:3522',
    spec: '0x60918C204F3c94630D3D793738Fc36293c8405D6:1010',
  },
  {
    label: 'Two copies of one NAND',
    note: 'byte-identical netlists',
    target: '0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6:2054',
    spec: '0x60918C204F3c94630D3D793738Fc36293c8405D6:1010',
  },
  {
    label: '8-bit adders, two processors',
    note: '17→9 circuits, 140 gates each',
    target: '0x69F663931209096037474d7C20402232E5C762cA:717',
    spec: '0x4f3B708af365B8f339Dd35a8985Ffe06c2553400:27',
  },
];

function Hunt() {
  const params = useSearchParams();
  const [target, setTarget] = useState(params.get('target') ?? PRESETS[0].target);
  const [spec, setSpec] = useState(params.get('spec') ?? PRESETS[0].spec);
  const { steps, outcome, error, running, run } = useMiter();
  const t = parseRef(target), s = parseRef(spec);

  const go = (tt = target, ss = spec) => {
    const a = parseRef(tt), b = parseRef(ss);
    if (!a || !b) return;
    // Update the shareable URL without a Next navigation (which would remount and drop run state).
    window.history.replaceState(null, '', `/hunt/?target=${a.cpu}:${a.id}&spec=${b.cpu}:${b.id}`);
    run(a, b);
  };

  useEffect(() => {
    if (params.get('target') && params.get('spec')) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-[640px] flex-col gap-2">
        <span className="eyebrow">Hunt</span>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Does this circuit do what it claims?</h1>
        <p className="text-md text-muted">
          Pick a target and a spec with the same pins. Miter loads both from X Layer, checks its simulator against the real processors,
          then has MiniSat search every possible input. Nothing is sent, and it costs nothing.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-1.5">
              <span className="label">Target circuit <span className="text-muted/70">(processor:id)</span></span>
              <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Spec circuit <span className="text-muted/70">(what the target should equal)</span></span>
              <input className="input" value={spec} onChange={(e) => setSpec(e.target.value)} spellCheck={false} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={!t || !s || running} onClick={() => go()}>
                <Play size={14} strokeWidth={1.5} /> {running ? 'Running…' : 'Run miter'}
              </button>
              {(!t || !s) && <span className="text-sm text-broken">Use the form 0x…processor:circuitId</span>}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="label">Live examples</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className="btn-ghost h-auto flex-col items-start gap-0 py-1.5 text-left"
                    onClick={() => { setTarget(p.target); setSpec(p.spec); go(p.target, p.spec); }}
                    disabled={running}
                  >
                    <span>{p.label}</span>
                    <span className="text-xs font-normal text-muted">{p.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {outcome && <OutcomeCard o={outcome} />}
          {outcome?.verdict.kind === 'counterexample' && (
            <Notice tone="accent">
              This input would win any open bounty on this pair.{' '}
              <Link className="underline" href={`/new?target=${outcome.target.cpu}:${outcome.target.id}&spec=${outcome.spec.cpu}:${outcome.spec.id}`}>
                Open one
              </Link>{' '}
              or find it on the <Link className="underline" href="/">bounty board</Link> <ArrowRight className="inline" size={12} />
            </Notice>
          )}
        </div>

        <aside className="card h-fit p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium">Run</span>
            {error && <span className="text-xs text-broken">stopped</span>}
          </div>
          <Steps items={steps} />
        </aside>
      </div>
    </div>
  );
}

export default function HuntPage() {
  return (
    <Suspense>
      <Hunt />
    </Suspense>
  );
}

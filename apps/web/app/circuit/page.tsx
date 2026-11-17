'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { bytesToHex, evaluate, evalOnChain, mapResolver, packBits, stats, type Circuit } from '@miter/core';
import { BitStrip, CircuitRef, cx, fmtNum, fmtOKB, Hash, Notice, Pill, Row, Section } from '@/components/ui';
import { circuitCache, depsOf, getCircuit, listBounties, ownerOf, tapeClient, type Bounty } from '@/lib/chain';
import { displayStatus } from '@/lib/format';
import { parseRef } from '@/lib/useMiter';

function Console({ c }: { c: Circuit }) {
  const n = Math.min(c.nIn, 64);
  const [bits, setBits] = useState<number[]>(() => Array(c.nIn).fill(0));
  const [onchain, setOnchain] = useState<{ hex: string; match: boolean } | null>(null);
  const input = packBits(bits);
  const out = useMemo(() => bytesToHex(evaluate(c, input, mapResolver(circuitCache))), [c, bits]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setOnchain(null), [bits]);
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <span className="label">Inputs (MSB → LSB). Click a bit to flip it.</span>
        <div className="flex flex-wrap gap-[3px]">
          {Array.from({ length: n }, (_, k) => n - 1 - k).map((i) => (
            <button
              key={i}
              onClick={() => setBits((b) => b.map((x, j) => (j === i ? 1 - x : x)))}
              className={cx('grid h-7 w-6 place-items-center rounded-[4px] border font-mono text-sm transition-colors duration-150', bits[i] ? 'border-fg/25 bg-surface-2 text-fg' : 'border-line bg-surface text-muted hover:text-fg', i % 8 === 0 && i !== 0 && 'mr-1.5')}
            >
              {bits[i]}
            </button>
          ))}
        </div>
        {c.nIn > 64 && <span className="text-xs text-muted">Showing the low 64 of {c.nIn} inputs.</span>}
      </div>
      <BitStrip label="Output" sub="local simulator" hex={out} n={c.nOut} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button className="btn-ghost" onClick={async () => { const r = bytesToHex(await evalOnChain(tapeClient, c.cpu, c.id, input)); setOnchain({ hex: r, match: r === out }); }}>
          Check on the processor
        </button>
        {onchain && (
          <span className={cx('text-sm', onchain.match ? 'text-proven' : 'text-broken')}>
            eval() returned <span className="font-mono">{onchain.hex}</span>: {onchain.match ? 'matches the simulator' : 'differs from the simulator'}
          </span>
        )}
      </div>
    </div>
  );
}

function CircuitView() {
  const p = useSearchParams();
  const ref = parseRef(p.get('c') ?? '');
  const [c, setC] = useState<Circuit | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bounties, setBounties] = useState<Bounty[]>([]);

  useEffect(() => {
    if (!ref) return;
    getCircuit(ref.cpu, ref.id).then(setC).catch((e) => setErr(e?.shortMessage ?? e?.message));
    ownerOf(ref.cpu, ref.id).then(setOwner);
    listBounties().then((all) => setBounties(all.filter((b) => (b.target.toLowerCase() === ref.cpu.toLowerCase() && b.targetId === ref.id) || (b.spec.toLowerCase() === ref.cpu.toLowerCase() && b.specId === ref.id)))).catch(() => {});
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ref) return <Notice>Give a circuit as <span className="font-mono">?c=0xprocessor:id</span>.</Notice>;
  if (err) return <Notice tone="broken">Couldn't load this circuit: {err}</Notice>;
  if (!c) return <div className="h-40 animate-pulse rounded-card bg-surface-2" />;
  const s = stats(c.netlist);
  const deps = depsOf(c);
  const bonded = bounties.filter((b) => b.state === 'Open' && b.target.toLowerCase() === c.cpu.toLowerCase() && b.targetId === c.id).reduce((x, b) => x + b.amount, 0n);
  const broken = bounties.some((b) => b.state === 'Paid' && b.target.toLowerCase() === c.cpu.toLowerCase() && b.targetId === c.id);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="eyebrow">Circuit</span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg tnum tracking-[-0.01em]">{c.cpu}<span className="text-muted">:</span>{String(c.id)}</h1>
          {broken ? <Pill status="Broken" /> : bonded > 0n ? <Pill status="Bonded" label={`Bonded · ${fmtOKB(bonded)} OKB`} /> : <Pill status="Open" label="Unbonded" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" href={`/hunt?target=${c.cpu}:${c.id}&spec=`}>Hunt against a spec</Link>
          <Link className="btn-ghost" href={`/new?target=${c.cpu}:${c.id}`}>Bond this circuit</Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-8">
          {c.nState === 0 ? (
            <Section title="Simulate"><Console c={c} /></Section>
          ) : (
            <Notice>This circuit keeps {c.nState} bits of LATCH state. Interactive stepping arrives with stateful bounties (M3).</Notice>
          )}
          <Section title="Bounties on this circuit">
            {bounties.length === 0 ? (
              <Notice>No bounties reference this circuit yet.</Notice>
            ) : (
              <div className="card divide-y divide-line">
                {bounties.map((b) => (
                  <Link key={String(b.id)} href={`/bounty?id=${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <span className="text-sm">
                      <span className="font-mono tnum">#{String(b.id)}</span>{' '}
                      <span className="text-muted">{b.target.toLowerCase() === c.cpu.toLowerCase() && b.targetId === c.id ? 'must equal' : 'is the spec for'}</span>{' '}
                      {b.target.toLowerCase() === c.cpu.toLowerCase() && b.targetId === c.id ? <CircuitRef cpu={b.spec} id={b.specId} /> : <CircuitRef cpu={b.target} id={b.targetId} />}
                    </span>
                    <span className="flex items-center gap-3"><span className="font-mono text-sm tnum">{fmtOKB(b.amount)} OKB</span><Pill status={displayStatus(b)} /></span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
        <aside className="card h-fit px-5 py-2">
          <Row k="Pins"><span className="font-mono tnum">{c.nIn} in → {c.nOut} out</span></Row>
          <Row k="Gates"><span className="font-mono tnum">{fmtNum(c.gateCount)}</span> <span className="text-muted">incl. referenced circuits</span></Row>
          <Row k="Top level"><span className="font-mono tnum">{s.nand} NAND · {s.latch} LATCH · {s.ref} REF</span></Row>
          <Row k="State bits"><span className="font-mono tnum">{c.nState}</span></Row>
          <Row k="Owner">{owner ? <Hash value={owner} /> : <span className="text-muted">—</span>}</Row>
          <Row k="Processor"><Hash value={c.cpu} /></Row>
          <Row k="Netlist hash"><Hash value={c.netlistHash} kind="hash" /></Row>
          {deps.length > 0 && (
            <Row k="References">
              <span className="flex flex-col gap-1">{deps.map((d) => <CircuitRef key={d.key} cpu={d.cpu} id={d.id} />)}</span>
            </Row>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function CircuitPage() {
  return (
    <Suspense>
      <CircuitView />
    </Suspense>
  );
}

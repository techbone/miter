'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CircuitRef, fmtNum, fmtOKB, Notice, Pill, Section, Stat } from '@/components/ui';
import { courtConfigured, listBounties, networkStats, type Bounty } from '@/lib/chain';
import { COURT, IS_FORK } from '@/lib/env';
import { displayStatus, relTime } from '@/lib/format';

function Pipeline() {
  const cells = [
    ['commit', 'keccak(id, input, you, salt)'],
    ['wait', '≥ 1 block'],
    ['reveal', 'input, salt'],
    ['judge', 'eval(target) ≠ eval(spec)'],
    ['pay', 'stake − 5% to you'],
  ];
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-xs text-muted">How a claim is judged: entirely on-chain, no reviewer</div>
      <ol className="grid grid-cols-1 sm:grid-cols-5">
        {cells.map(([k, v], i) => (
          <li key={k} className="flex flex-col gap-1 border-line px-4 py-3 sm:border-r sm:last:border-r-0 max-sm:border-b max-sm:last:border-b-0">
            <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-sm font-medium">{k}</span>
            <span className="font-mono text-xs text-muted">{v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BountyTable({ rows, loading, error }: { rows: Bounty[]; loading: boolean; error: string | null }) {
  if (!courtConfigured())
    return (
      <Notice>
        MiterCourt isn't deployed on this network yet, so there are no bounties to show. Hunting still works: open{' '}
        <Link href="/hunt" className="underline">Hunt</Link> to run a miter on any live circuit.
      </Notice>
    );
  if (error) return <Notice tone="broken">Couldn't read bounties: {error}</Notice>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2.5 font-normal">#</th>
            <th className="px-4 py-2.5 font-normal">Target</th>
            <th className="px-4 py-2.5 font-normal">Must equal</th>
            <th className="px-4 py-2.5 font-normal">Pins</th>
            <th className="px-4 py-2.5 text-right font-normal">Stake (OKB)</th>
            <th className="px-4 py-2.5 font-normal">Expires</th>
            <th className="px-4 py-2.5 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td colSpan={7} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-surface-2" /></td>
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No bounties yet. <Link href="/new" className="text-fg underline">Open the first one</Link>.</td></tr>
          )}
          {!loading &&
            rows.map((b) => (
              <tr key={String(b.id)} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <td className="px-4 py-3"><Link href={`/bounty?id=${b.id}`} className="font-mono tnum hover:underline">{String(b.id)}</Link></td>
                <td className="px-4 py-3"><CircuitRef cpu={b.target} id={b.targetId} /></td>
                <td className="px-4 py-3"><CircuitRef cpu={b.spec} id={b.specId} /></td>
                <td className="px-4 py-3 font-mono tnum text-muted">{b.nIn}→{b.nOut}</td>
                <td className="px-4 py-3 text-right font-mono tnum">{fmtOKB(b.amount)}</td>
                <td className="px-4 py-3 text-muted">{b.state === 'Open' ? relTime(b.expiry) : '—'}</td>
                <td className="px-4 py-3"><Link href={`/bounty?id=${b.id}`}><Pill status={displayStatus(b)} /></Link></td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [stats, setStats] = useState<{ processors: number; circuits: number } | null>(null);
  const [rows, setRows] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Bounties first: both calls share one batched RPC queue, and the stats scan is ~900 reads.
    listBounties()
      .then(setRows)
      .catch((e) => setError(e?.shortMessage ?? e?.message))
      .finally(() => {
        setLoading(false);
        networkStats().then(setStats).catch(() => setStats(null));
      });
  }, []);

  const now = Date.now() / 1000;
  const bonded = rows.filter((b) => b.state === 'Open' && b.expiry > now).reduce((s, b) => s + b.amount, 0n);
  const broken = rows.filter((b) => b.state === 'Paid').length;

  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div className="flex max-w-[620px] flex-col gap-4">
          <span className="eyebrow">Correctness bounties for TapeOut circuits</span>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">On TapeOut, a bug proves itself.</h1>
          <p className="text-md text-muted">
            Stake OKB that a circuit matches its spec. Anyone who finds an input where it doesn't is paid by the contract,
            after the contract re-runs both circuits on X Layer. There's no reviewer and no dispute, because a counterexample is a fact anyone can check.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/hunt" className="btn-primary">Hunt a circuit <ArrowRight size={14} strokeWidth={1.5} /></Link>
            <Link href="/new" className="btn-ghost">Open a bounty</Link>
          </div>
        </div>
        <div className="card grid grid-cols-2 gap-5 p-5">
          <Stat label="Circuits on X Layer" value={stats ? fmtNum(stats.circuits) : '—'} />
          <Stat label="Processors" value={stats ? fmtNum(stats.processors) : '—'} />
          <Stat label="Bonded now (OKB)" value={courtConfigured() ? fmtOKB(bonded) : '—'} />
          <Stat label="Circuits broken" value={courtConfigured() ? fmtNum(broken) : '—'} />
        </div>
      </section>

      <Pipeline />

      <Section
        title="Bounties"
        aside={COURT ? <span className="font-mono text-xs text-muted">MiterCourt {COURT.slice(0, 8)}…{IS_FORK ? ' · local fork' : ''}</span> : null}
      >
        <BountyTable rows={rows} loading={loading && courtConfigured()} error={error} />
      </Section>
    </div>
  );
}

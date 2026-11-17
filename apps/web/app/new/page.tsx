'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { decodeEventLog, parseEther, type Hex } from 'viem';
import { OutcomeCard } from '@/components/outcome';
import { Notice, Steps, type StepItem } from '@/components/ui';
import { client, courtConfigured } from '@/lib/chain';
import { courtAbi } from '@/lib/courtAbi';
import { COURT } from '@/lib/env';
import { confirm, errMsg } from '@/lib/tx';
import { parseRef, useMiter } from '@/lib/useMiter';
import { useWallet } from '@/lib/wallet';

const txSteps = (): StepItem[] => [
  { key: 'wallet', label: 'Connect a wallet on X Layer', state: 'idle' },
  { key: 'open', label: 'Escrow the stake and pin both netlists', state: 'idle' },
  { key: 'confirm', label: 'Confirmed on-chain', state: 'idle' },
];

function NewBounty() {
  const p = useSearchParams();
  const [target, setTarget] = useState(p.get('target') ?? '');
  const [spec, setSpec] = useState(p.get('spec') ?? '');
  const [stake, setStake] = useState('0.001');
  const [hours, setHours] = useState('72');
  const miter = useMiter();
  const w = useWallet();
  const [steps, setSteps] = useState<StepItem[]>(txSteps);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<bigint | null>(null);
  const set = (k: string, patch: Partial<StepItem>) => setSteps((s) => s.map((x) => (x.key === k ? { ...x, ...patch } : x)));

  const t = parseRef(target), s = parseRef(spec);
  let stakeWei: bigint | null = null;
  try { stakeWei = parseEther(stake); } catch { stakeWei = null; }
  const h = Number(hours);
  const valid = Boolean(t && s && stakeWei && stakeWei > 0n && h >= 0.25 && h <= 24 * 365);
  const checked = miter.outcome && t && s && miter.outcome.target.key === `${t.cpu.toLowerCase()}:${t.id}` && miter.outcome.spec.key === `${s.cpu.toLowerCase()}:${s.id}`;

  async function submit() {
    if (!t || !s || !stakeWei) return;
    setBusy(true);
    setSteps(txSteps());
    let cur = 'wallet';
    try {
      set('wallet', { state: 'active' });
      if (!w.address) await w.connect();
      await w.ensureChain();
      set('wallet', { state: 'done', detail: 'X Layer · chain 196' });

      cur = 'open';
      set('open', { state: 'active', detail: 'Confirm in your wallet' });
      const block = await client.getBlock();
      const expiry = Number(block.timestamp) + Math.round(h * 3600);
      const wallet = w.wallet();
      const hash = await wallet.writeContract({
        address: COURT as Hex, abi: courtAbi, functionName: 'open',
        args: [t.cpu, t.id, s.cpu, s.id, expiry], value: stakeWei, chain: wallet.chain, account: wallet.account!,
      });
      set('open', { state: 'done', tx: hash, detail: 'Submitted' });

      cur = 'confirm';
      set('confirm', { state: 'active', detail: 'Waiting for the receipt' });
      const r = await confirm(hash);
      const ev = r.logs
        .map((l) => { try { return decodeEventLog({ abi: courtAbi, data: l.data, topics: l.topics }); } catch { return null; } })
        .find((e) => e?.eventName === 'BountyOpened') as any;
      const id = ev?.args?.id as bigint;
      set('confirm', { state: 'done', detail: `Bounty #${id} is live in block ${r.blockNumber}` });
      setCreated(id);
    } catch (e) {
      set(cur, { state: 'error', detail: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-[640px] flex-col gap-2">
        <span className="eyebrow">Open a bounty</span>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Put a stake behind a circuit</h1>
        <p className="text-md text-muted">
          Your stake says the target computes exactly what the spec computes. Anyone who finds an input where they differ takes it.
          If nobody does by the expiry, you withdraw it. If either netlist changes on-chain, the bounty voids and you withdraw at once.
        </p>
      </header>

      {!courtConfigured() && <Notice>MiterCourt isn't deployed on this network yet. You can still check a pair below.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-1.5">
              <span className="label">Target circuit (processor:id)</span>
              <input className="input" placeholder="0x87BF…:3522" value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Spec circuit: the reference the target must equal</span>
              <input className="input" placeholder="0x6091…:1010" value={spec} onChange={(e) => setSpec(e.target.value)} spellCheck={false} />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="label">Stake (OKB)</span>
                <input className="input" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Locked for (hours)</span>
                <input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button className="btn-ghost" disabled={!t || !s || miter.running} onClick={() => t && s && miter.run(t, s)}>
                {miter.running ? 'Checking…' : 'Check the pair first'}
              </button>
              <button className="btn-accent" disabled={!valid || busy || !courtConfigured()} onClick={submit}>
                {busy ? 'Opening…' : `Open bounty · ${stake || 0} OKB`}
              </button>
            </div>
          </div>

          {checked && miter.outcome?.verdict.kind === 'counterexample' && (
            <Notice tone="broken">
              These circuits already differ, so anyone can claim this bounty right away. Only fund it if that's what you want, for example to demo a payout.
            </Notice>
          )}
          {checked && miter.outcome?.verdict.kind === 'equivalent' && (
            <Notice tone="proven">
              MiniSat proved these circuits equivalent, so no input can claim this stake. It works as a public bond: the circuit is bonded, and the bond voids if either netlist ever changes.
            </Notice>
          )}
          {miter.outcome && <OutcomeCard o={miter.outcome} />}
          {created !== null && (
            <Notice tone="proven">
              Bounty #{String(created)} is open. <Link className="underline" href={`/bounty?id=${created}`}>View it</Link>
            </Notice>
          )}
        </div>

        <aside className="flex h-fit flex-col gap-4">
          <div className="card p-5">
            <div className="mb-4 text-sm font-medium">Opening</div>
            <Steps items={steps} />
          </div>
          {(miter.running || miter.outcome || miter.error) && (
            <div className="card p-5">
              <div className="mb-4 text-sm font-medium">Pair check</div>
              <Steps items={miter.steps} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function NewPage() {
  return (
    <Suspense>
      <NewBounty />
    </Suspense>
  );
}

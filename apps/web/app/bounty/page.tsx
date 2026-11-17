'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { encodeAbiParameters, getAddress, keccak256, toHex, type Hex } from 'viem';
import { evalOnChain, hexToBytes, bytesToHex } from '@miter/core';
import { OutcomeCard } from '@/components/outcome';
import { BitStrip, CircuitRef, fmtOKB, Hash, Notice, Pill, Row, Steps, type StepItem } from '@/components/ui';
import { client, counterexampleOf, courtConfigured, eventAt, getBounty, tapeClient, type Bounty } from '@/lib/chain';
import { courtAbi } from '@/lib/courtAbi';
import { COURT } from '@/lib/env';
import { displayStatus, inputSpace, relTime } from '@/lib/format';
import { confirm, errMsg } from '@/lib/tx';
import { useMiter } from '@/lib/useMiter';
import { useWallet } from '@/lib/wallet';

interface SavedClaim { input: Hex; salt: Hex; commitTx?: Hex; commitBlock?: string }
const claimKey = (id: bigint, who: string) => `miter:claim:${COURT}:${id}:${who.toLowerCase()}`;
const loadClaim = (id: bigint, who: string): SavedClaim | null => {
  try { const v = localStorage.getItem(claimKey(id, who)); return v ? JSON.parse(v) : null; } catch { return null; }
};
const saveClaim = (id: bigint, who: string, v: SavedClaim) => { try { localStorage.setItem(claimKey(id, who), JSON.stringify(v)); } catch { /* best effort */ } };

const commitmentOf = (id: bigint, input: Hex, hunter: Hex, salt: Hex) =>
  keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }, { type: 'bytes32' }], [id, input, hunter, salt]));

function PinCheck({ b }: { b: Bounty }) {
  const [now, setNow] = useState<{ t: Hex; s: Hex } | null>(null);
  useEffect(() => {
    Promise.all([
      client.readContract({ address: COURT as Hex, abi: courtAbi, functionName: 'netlistHash', args: [b.target, b.targetId] }),
      client.readContract({ address: COURT as Hex, abi: courtAbi, functionName: 'netlistHash', args: [b.spec, b.specId] }),
    ]).then(([t, s]) => setNow({ t: t as Hex, s: s as Hex })).catch(() => {});
  }, [b]);
  if (!now) return <span className="text-muted">checking…</span>;
  const ok = now.t === b.targetHash && now.s === b.specHash;
  return ok
    ? <span className="text-proven">Both netlists still match their pinned hashes</span>
    : <span className="text-broken">A netlist changed since this bounty opened. The next reveal voids it.</span>;
}

function PaidView({ b }: { b: Bounty }) {
  const [input, setInput] = useState<Hex | null>(null);
  const [outs, setOuts] = useState<{ t: Hex; s: Hex } | null>(null);
  const [claim, setClaim] = useState<any>(null);
  useEffect(() => {
    counterexampleOf(b.id).then(async (x) => {
      setInput(x);
      if (!x) return;
      const [t, s] = await Promise.all([evalOnChain(tapeClient, b.target, b.targetId, hexToBytes(x)), evalOnChain(tapeClient, b.spec, b.specId, hexToBytes(x))]);
      setOuts({ t: bytesToHex(t), s: bytesToHex(s) });
    });
    eventAt('Claimed', b.id, b.settledBlock).then(setClaim);
  }, [b]);
  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill status="Broken" />
        <span className="text-sm text-muted">The contract re-ran both circuits on this input and paid the hunter.</span>
      </div>
      {input && <BitStrip label="Winning input" sub={input} hex={input} n={b.nIn} />}
      {outs && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <BitStrip label="Target out" sub="eval() now" hex={outs.t} n={b.nOut} against={outs.s} />
          <BitStrip label="Spec out" sub="eval() now" hex={outs.s} n={b.nOut} against={outs.t} />
        </div>
      )}
      <div className="border-t border-line pt-2">
        <Row k="Hunter"><Hash value={b.hunter} /></Row>
        {claim && <Row k="Paid"><span className="font-mono tnum">{fmtOKB(claim.args.paid)} OKB</span> <span className="text-muted">+ {fmtOKB(claim.args.fee)} fee</span></Row>}
        {claim && <Row k="Claim tx"><Hash value={claim.transactionHash} kind="tx" /></Row>}
        <Row k="Block"><span className="font-mono tnum">{String(b.settledBlock)}</span></Row>
      </div>
    </div>
  );
}

const claimSteps = (): StepItem[] => [
  { key: 'find', label: 'Find an input where they differ', state: 'idle' },
  { key: 'commit', label: 'Commit to it (hidden)', state: 'idle' },
  { key: 'wait', label: 'Wait one block', state: 'idle' },
  { key: 'reveal', label: 'Reveal, and the contract re-runs both circuits', state: 'idle' },
  { key: 'verified', label: 'Verified on-chain', state: 'idle' },
];

function ClaimPanel({ b, onDone }: { b: Bounty; onDone: () => void }) {
  const w = useWallet();
  const miter = useMiter();
  const [steps, setSteps] = useState<StepItem[]>(claimSteps);
  const [input, setInput] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, patch: Partial<StepItem>) => setSteps((s) => s.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const verified = steps[4].state === 'done';

  // resume a claim committed earlier from this browser
  useEffect(() => {
    if (!w.address) return;
    const saved = loadClaim(b.id, w.address);
    if (saved?.commitBlock) {
      setInput(saved.input);
      set('find', { state: 'done', detail: `input ${saved.input}` });
      set('commit', { state: 'done', tx: saved.commitTx, detail: `committed in block ${saved.commitBlock}` });
    }
  }, [w.address, b.id]);

  async function find() {
    set('find', { state: 'active', detail: 'Running the miter' });
    const o = await miter.run({ cpu: b.target, id: b.targetId }, { cpu: b.spec, id: b.specId });
    if (!o) return set('find', { state: 'error', detail: miter.error ?? 'Solver failed' });
    if (o.verdict.kind === 'equivalent') return set('find', { state: 'error', detail: 'MiniSat proved the circuits equivalent. There is nothing to claim.' });
    setInput(o.input!);
    set('find', { state: 'done', detail: `input ${o.input} → ${o.targetOut} vs ${o.specOut}` });
  }

  async function claim() {
    if (!input) return;
    setBusy(true);
    let cur = 'commit';
    try {
      if (!w.address) await w.connect();
      await w.ensureChain();
      const wallet = w.wallet();
      const me = getAddress(wallet.account!.address);
      let saved = loadClaim(b.id, me);
      if (!saved || saved.input !== input || !saved.commitBlock) {
        const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
        saved = { input, salt };
        saveClaim(b.id, me, saved); // persist before sending so a closed tab can still reveal
        set('commit', { state: 'active', detail: 'Confirm in your wallet' });
        const hash = await wallet.writeContract({ address: COURT as Hex, abi: courtAbi, functionName: 'commit', args: [commitmentOf(b.id, input, me, salt)], chain: wallet.chain, account: wallet.account! });
        set('commit', { state: 'active', tx: hash, detail: 'Waiting for the receipt' });
        const r = await confirm(hash);
        saved = { ...saved, commitTx: hash, commitBlock: String(r.blockNumber) };
        saveClaim(b.id, me, saved);
        set('commit', { state: 'done', tx: hash, detail: `committed in block ${r.blockNumber}` });
      }

      cur = 'wait';
      set('wait', { state: 'active', detail: 'Front-runners can’t use a commitment that names your address' });
      const cb = BigInt(saved.commitBlock!);
      while ((await client.getBlockNumber({ cacheTime: 0 })) <= cb) await new Promise((r) => setTimeout(r, 800));
      set('wait', { state: 'done', detail: `now past block ${cb}` });

      cur = 'reveal';
      set('reveal', { state: 'active', detail: 'Confirm in your wallet' });
      const hash = await wallet.writeContract({ address: COURT as Hex, abi: courtAbi, functionName: 'reveal', args: [b.id, input, saved.salt], chain: wallet.chain, account: wallet.account! });
      set('reveal', { state: 'active', tx: hash, detail: 'The contract is calling eval() on both processors' });
      const r = await confirm(hash);
      set('reveal', { state: 'done', tx: hash, detail: `included in block ${r.blockNumber}, ${r.gasUsed.toLocaleString()} gas` });

      cur = 'verified';
      set('verified', { state: 'active' });
      const after = await getBounty(b.id);
      if (after.state === 'Paid' && getAddress(after.hunter) === me) {
        const ev = await eventAt('Claimed', b.id, after.settledBlock);
        set('verified', { state: 'done', detail: ev ? `paid ${fmtOKB(ev.args.paid)} OKB to you · circuit flagged Broken against this spec` : 'bounty is Paid to your address' });
        try { localStorage.removeItem(claimKey(b.id, me)); } catch { /* ignore */ }
        onDone();
      } else if (after.state === 'Voided') {
        set('verified', { state: 'error', detail: 'A netlist changed since open, so the bounty was voided instead of paid' });
      } else {
        set('verified', { state: 'error', detail: `bounty state is ${after.state}` });
      }
    } catch (e) {
      set(cur, { state: 'error', detail: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Claim this bounty</span>
          <span className="text-xs text-muted">2 transactions · about 0.00001 OKB in gas</span>
        </div>
        <Steps items={steps} />
        {!verified && <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {!input && <button className="btn-primary" disabled={miter.running} onClick={find}>{miter.running ? 'Solving…' : 'Find a breaking input'}</button>}
          {input && <button className="btn-accent" disabled={busy} onClick={claim}>{busy ? 'Claiming…' : steps[1].state === 'done' ? 'Reveal and claim' : 'Commit and claim'}</button>}
        </div>}
      </div>
      {miter.outcome && !verified && <OutcomeCard o={miter.outcome} />}
    </div>
  );
}

function FunderPanel({ b, onDone }: { b: Bounty; onDone: () => void }) {
  const w = useWallet();
  const [state, setState] = useState<StepItem>({ key: 'w', label: 'Withdraw your stake', state: 'idle' });
  const expired = b.state === 'Open' && b.expiry < Date.now() / 1000;
  if (!w.address || getAddress(w.address) !== getAddress(b.funder) || !(expired || b.state === 'Voided')) return null;
  return (
    <div className="card flex flex-col gap-3 p-5">
      <Steps items={[state]} />
      <button
        className="btn-ghost w-fit"
        onClick={async () => {
          try {
            await w.ensureChain();
            const wallet = w.wallet();
            setState((s) => ({ ...s, state: 'active', detail: 'Confirm in your wallet' }));
            const hash = await wallet.writeContract({ address: COURT as Hex, abi: courtAbi, functionName: 'withdraw', args: [b.id], chain: wallet.chain, account: wallet.account! });
            await confirm(hash);
            setState((s) => ({ ...s, state: 'done', tx: hash, detail: `${fmtOKB(b.amount)} OKB returned` }));
            onDone();
          } catch (e) {
            setState((s) => ({ ...s, state: 'error', detail: errMsg(e) }));
          }
        }}
      >
        Withdraw {fmtOKB(b.amount)} OKB
      </button>
    </div>
  );
}

function BountyView() {
  const p = useSearchParams();
  const idStr = p.get('id');
  const [b, setB] = useState<Bounty | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opened, setOpened] = useState<any>(null);
  const [claimedHere, setClaimedHere] = useState(false);
  const reload = useCallback(() => {
    if (!idStr || !courtConfigured()) return;
    getBounty(BigInt(idStr))
      .then((x) => { if (x.state === 'None') setErr('No bounty with this id.'); else { setB(x); eventAt('BountyOpened', x.id, x.openedBlock).then(setOpened); } })
      .catch((e) => setErr(e?.shortMessage ?? e?.message));
  }, [idStr]);
  useEffect(reload, [reload]);

  if (!courtConfigured()) return <Notice>MiterCourt isn't deployed on this network yet.</Notice>;
  if (!idStr) return <Notice>No bounty id given. <Link className="underline" href="/">Back to bounties</Link></Notice>;
  if (err) return <Notice tone="broken">{err}</Notice>;
  if (!b) return <div className="h-40 animate-pulse rounded-card bg-surface-2" />;

  const status = displayStatus(b);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-sm text-muted hover:text-fg">← Bounties</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Bounty <span className="font-mono tnum">#{String(b.id)}</span></h1>
          <Pill status={status} />
        </div>
        <p className="max-w-[680px] text-md text-muted">
          <span className="font-mono tnum text-fg">{fmtOKB(b.amount)} OKB</span> says <CircuitRef cpu={b.target} id={b.targetId} className="text-md text-fg" /> computes
          exactly what <CircuitRef cpu={b.spec} id={b.specId} className="text-md text-fg" /> computes, on all {inputSpace(b.nIn)} inputs.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          {b.state === 'Paid' && <PaidView b={b} />}
          {/* Keep the claim steps on screen after success: the chain reload flips the bounty to Paid. */}
          {(b.state === 'Open' || claimedHere) && <ClaimPanel b={b} onDone={() => { setClaimedHere(true); reload(); }} />}
          {b.state === 'Voided' && <Notice>This bounty was voided because a netlist changed after it opened. The funder can withdraw.</Notice>}
          {b.state === 'Withdrawn' && <Notice>The funder withdrew this stake after it went unclaimed or was voided.</Notice>}
          <FunderPanel b={b} onDone={reload} />
        </div>
        <aside className="card h-fit px-5 py-2">
          <Row k="Stake"><span className="font-mono tnum">{fmtOKB(b.amount)} OKB</span></Row>
          <Row k="Funder"><Hash value={b.funder} /></Row>
          <Row k="Pins"><span className="font-mono tnum">{b.nIn} in → {b.nOut} out</span></Row>
          <Row k="Expires"><span title={new Date(b.expiry * 1000).toISOString()}>{relTime(b.expiry)}</span></Row>
          <Row k="Target hash"><Hash value={b.targetHash} kind="hash" /></Row>
          <Row k="Spec hash"><Hash value={b.specHash} kind="hash" /></Row>
          <Row k="Integrity"><PinCheck b={b} /></Row>
          {opened && <Row k="Opened in"><Hash value={opened.transactionHash} kind="tx" /></Row>}
        </aside>
      </div>
    </div>
  );
}

export default function BountyPage() {
  return (
    <Suspense>
      <BountyView />
    </Suspense>
  );
}

'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { formatEther } from 'viem';
import { unpackBits, hexToBytes } from '@miter/core';
import { explorerAddr, explorerTx } from '@/lib/env';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function short(h: string, a = 6, b = 4) {
  return h.length <= a + b + 2 ? h : `${h.slice(0, a)}…${h.slice(-b)}`;
}

export function fmtOKB(wei: bigint) {
  const s = formatEther(wei);
  const [i, f = ''] = s.split('.');
  const frac = f.slice(0, 6).replace(/0+$/, '');
  return `${Number(i).toLocaleString('en-US')}${frac ? '.' + frac : ''}`;
}

export function fmtNum(n: number) {
  return n.toLocaleString('en-US');
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono tnum', className)}>{children}</span>;
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      className="text-muted transition-colors hover:text-fg"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      {ok ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
    </button>
  );
}

/** Address or hash: mono, truncated, copyable, linked to the explorer when on mainnet. */
export function Hash({ value, kind = 'address', full = false }: { value: string; kind?: 'address' | 'tx' | 'hash'; full?: boolean }) {
  const href = kind === 'tx' ? explorerTx(value) : kind === 'address' ? explorerAddr(value) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Mono className="text-sm">{full ? value : short(value)}</Mono>
      <CopyBtn value={value} />
      {href && (
        <a href={href} target="_blank" rel="noreferrer" aria-label="Open in explorer" className="text-muted hover:text-fg">
          <ExternalLink size={13} strokeWidth={1.5} />
        </a>
      )}
    </span>
  );
}

/** A circuit reference `cpu:id`, linking to its page. */
export function CircuitRef({ cpu, id, className }: { cpu: string; id: bigint | number | string; className?: string }) {
  return (
    <Link href={`/circuit?c=${cpu}:${id}`} className={cx('font-mono tnum text-sm hover:underline', className)}>
      {short(cpu, 6, 4)}<span className="text-muted">:</span>{String(id)}
    </Link>
  );
}

const PILL: Record<string, string> = {
  Open: 'text-fg', Bonded: 'text-accent', Paid: 'text-broken', Broken: 'text-broken', Proven: 'text-proven',
  Equivalent: 'text-proven', Voided: 'text-muted', Withdrawn: 'text-muted', Expired: 'text-muted',
};
export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-full border border-line bg-surface px-2 text-xs font-medium', PILL[status] ?? 'text-fg')}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? status}
    </span>
  );
}

/**
 * The signature visual: bits as monospace cells, MSB → LSB left to right.
 * `against` marks cells that differ from another bit vector in the broken color.
 */
export function BitStrip({ hex, n, against, label, sub }: { hex: string; n: number; against?: string; label: string; sub?: ReactNode }) {
  const bits = unpackBits(hexToBytes(hex), n);
  const other = against ? unpackBits(hexToBytes(against), n) : null;
  const idx = Array.from({ length: n }, (_, k) => n - 1 - k);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="w-28 shrink-0 pt-0.5">
        <div className="text-sm text-fg">{label}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
      <div className="flex min-w-0 flex-wrap gap-[3px]">
        {idx.map((i) => {
          const diff = other ? other[i] !== bits[i] : false;
          return (
            <span
              key={i}
              title={`bit ${i} = ${bits[i]}`}
              className={cx(
                'grid h-7 w-6 place-items-center rounded-[4px] border font-mono text-sm tnum transition-colors duration-150',
                diff ? 'border-broken bg-broken/10 text-broken' : bits[i] ? 'border-fg/25 bg-surface-2 text-fg' : 'border-line bg-surface text-muted',
                i % 8 === 0 && i !== 0 && 'mr-1.5',
              )}
            >
              {bits[i]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export type StepState = 'idle' | 'active' | 'done' | 'error' | 'skipped';
export interface StepItem { key: string; label: string; state: StepState; detail?: ReactNode; tx?: string }

export function Steps({ items }: { items: StepItem[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-20px)] w-px bg-line" />}
          <span
            className={cx(
              'mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border text-[11px] transition-colors duration-200',
              s.state === 'done' && 'border-proven bg-proven text-white',
              s.state === 'active' && 'border-accent text-accent',
              s.state === 'error' && 'border-broken bg-broken text-white',
              (s.state === 'idle' || s.state === 'skipped') && 'border-line text-muted',
            )}
          >
            {s.state === 'done' ? <Check size={11} strokeWidth={2.5} /> : s.state === 'error' ? <X size={11} strokeWidth={2.5} /> : s.state === 'active' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> : <span className="font-mono">{i + 1}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className={cx('text-sm', s.state === 'idle' || s.state === 'skipped' ? 'text-muted' : 'text-fg')}>{s.label}</span>
              {s.tx && <Hash value={s.tx} kind="tx" />}
            </div>
            {s.detail && <div className="mt-0.5 break-words text-xs text-muted">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-lg tnum text-fg">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'broken' | 'proven' | 'accent'; children: ReactNode }) {
  const c = { muted: 'border-line text-muted', broken: 'border-broken/40 text-broken', proven: 'border-proven/40 text-proven', accent: 'border-accent/40 text-accent' }[tone];
  return <div className={cx('rounded-ctl border bg-surface px-3 py-2 text-sm', c)}>{children}</div>;
}

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-md font-semibold tracking-[-0.01em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-2 last:border-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="min-w-0 break-words text-sm">{children}</span>
    </div>
  );
}

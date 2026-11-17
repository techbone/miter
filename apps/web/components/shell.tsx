'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Moon, Sun, Wallet } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { IS_FORK } from '@/lib/env';
import { cx, short } from './ui';

export function Glyph({ size = 18 }: { size?: number }) {
  // A miter joint: two members meeting at a corner along a 45° seam.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M3 17.5V3h14.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
      <path d="M1.8 1.8l6.4 6.4" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { href: '/', label: 'Bounties' },
  { href: '/hunt', label: 'Hunt' },
  { href: '/new', label: 'Open a bounty' },
];

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem('miter:theme'); } catch { /* ignore */ }
    const isDark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try { localStorage.setItem('miter:theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  return (
    <button type="button" onClick={toggle} aria-label="Toggle theme" className="grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-fg">
      {dark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
    </button>
  );
}

function ConnectButton() {
  const { address, chainOk, available, connect, ensureChain } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  if (!address)
    return (
      <button
        type="button"
        className="btn-ghost"
        title={err ?? undefined}
        onClick={() => connect().catch((e) => setErr(e.message))}
      >
        <Wallet size={14} strokeWidth={1.5} />
        {available ? 'Connect' : 'No wallet'}
      </button>
    );
  if (!chainOk)
    return (
      <button type="button" className="btn-ghost text-accent" onClick={() => ensureChain().catch(() => {})}>
        Switch to X Layer
      </button>
    );
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-ctl border border-line bg-surface px-3 font-mono text-sm tnum">
      <span className="h-1.5 w-1.5 rounded-full bg-proven" />
      {short(address)}
    </span>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-page items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-fg">
          <Glyph />
          <span className="text-md font-semibold tracking-[-0.02em]">Miter</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx('rounded-ctl px-2.5 py-1.5 text-sm transition-colors', path === n.href ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-xs text-muted sm:inline-flex">
            <span className={cx('h-1.5 w-1.5 rounded-full', IS_FORK ? 'bg-accent' : 'bg-proven')} />
            {IS_FORK ? 'X Layer fork · 196' : 'X Layer · 196'}
          </span>
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
      <nav className="mx-auto flex max-w-page gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cx('shrink-0 rounded-ctl px-2.5 py-1 text-sm', path === n.href ? 'bg-surface-2 text-fg' : 'text-muted')}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-page flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Miter runs entirely in your browser. Circuits are read from X Layer, and the solver runs locally.</span>
        <span>Contracts are unaudited. Stakes are demo-sized. Not financial advice.</span>
      </div>
    </footer>
  );
}

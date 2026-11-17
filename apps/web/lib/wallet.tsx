'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createWalletClient, custom, type Hex, type WalletClient } from 'viem';
import { xLayer } from '@miter/core';
import { IS_FORK, RPC_URL } from './env';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any>; on?: (e: string, f: (...a: any[]) => void) => void; removeListener?: (e: string, f: (...a: any[]) => void) => void };

function provider(): Eip1193 | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return (w.okxwallet as Eip1193) ?? (w.ethereum as Eip1193) ?? null;
}

const chain = { ...xLayer, rpcUrls: { default: { http: [RPC_URL] } } } as const;
const CHAIN_HEX = '0xc4'; // 196

interface WalletCtx {
  address: Hex | null;
  chainOk: boolean;
  available: boolean;
  connect: () => Promise<void>;
  ensureChain: () => Promise<void>;
  wallet: () => WalletClient;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Hex | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const p = provider();
    setAvailable(Boolean(p));
    if (!p) return;
    p.request({ method: 'eth_accounts' }).then((a: string[]) => setAddress((a[0] as Hex) ?? null)).catch(() => {});
    p.request({ method: 'eth_chainId' }).then(setChainId).catch(() => {});
    const onAcc = (a: string[]) => setAddress((a[0] as Hex) ?? null);
    const onChain = (c: string) => setChainId(c);
    p.on?.('accountsChanged', onAcc);
    p.on?.('chainChanged', onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAcc);
      p.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) throw new Error('No browser wallet found. Install OKX Wallet or MetaMask.');
    const a: string[] = await p.request({ method: 'eth_requestAccounts' });
    setAddress((a[0] as Hex) ?? null);
    setChainId(await p.request({ method: 'eth_chainId' }));
  }, []);

  const ensureChain = useCallback(async () => {
    const p = provider();
    if (!p) throw new Error('No browser wallet found.');
    const current = await p.request({ method: 'eth_chainId' });
    if (current?.toLowerCase() === CHAIN_HEX) return;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (e: any) {
      if (e?.code !== 4902) throw e;
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: CHAIN_HEX, chainName: IS_FORK ? 'X Layer (local fork)' : 'X Layer', nativeCurrency: chain.nativeCurrency, rpcUrls: [RPC_URL] }],
      });
    }
    setChainId(CHAIN_HEX);
  }, []);

  const wallet = useCallback(() => {
    const p = provider();
    if (!p || !address) throw new Error('Connect a wallet first.');
    return createWalletClient({ account: address, chain, transport: custom(p) });
  }, [address]);

  const value = useMemo(
    () => ({ address, chainOk: chainId?.toLowerCase() === CHAIN_HEX, available, connect, ensureChain, wallet }),
    [address, chainId, available, connect, ensureChain, wallet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet outside WalletProvider');
  return v;
}

'use client';
import type { Hex, TransactionReceipt } from 'viem';
import { client } from './chain';

/** Waits for a receipt and fails loudly on revert; UI must never say "done" before this. */
export async function confirm(hash: Hex): Promise<TransactionReceipt> {
  const r = await client.waitForTransactionReceipt({ hash, pollingInterval: 1000, timeout: 120_000 });
  if (r.status !== 'success') throw new Error(`Transaction reverted (${hash.slice(0, 10)}…)`);
  return r;
}

export function errMsg(e: any): string {
  const m = e?.shortMessage ?? e?.details ?? e?.message ?? String(e);
  const custom = String(e?.message ?? '').match(/custom error '([A-Za-z]+)\(/)?.[1] ?? e?.cause?.data?.errorName;
  return custom ? `${custom}: ${humanError(custom)}` : m;
}

const HUMAN: Record<string, string> = {
  PinMismatch: 'the two circuits have different pin counts',
  Stateful: 'one circuit has LATCH state (stateful bounties arrive in M3)',
  SameCircuit: 'target and spec are the same circuit',
  NotProcessor: 'that address is not a TapeOut processor',
  BadStake: 'the stake must be more than zero',
  BadExpiry: 'the expiry must be at least 10 minutes away',
  NotOpen: 'this bounty is no longer open',
  AlreadyCommitted: 'this commitment already exists',
  CommitTooFresh: 'wait one more block after committing',
  UnknownCommitment: 'no matching commitment from this address',
  BadInputLength: 'input length does not match the pin count',
  OutputsAgree: 'both circuits return the same output for this input',
  NotFunder: 'only the funder can withdraw',
  NotWithdrawable: 'the stake is locked until expiry',
  TransferFailed: 'the receiving address rejected OKB',
};
const humanError = (n: string) => HUMAN[n] ?? 'reverted';

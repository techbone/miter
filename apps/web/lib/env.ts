import type { Hex } from 'viem';

export const RPC_URL = process.env.NEXT_PUBLIC_XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
/** True when pointed at a local Hardhat fork of X Layer mainnet (dev / demo rehearsal). */
export const IS_FORK = /127\.0\.0\.1|localhost/.test(RPC_URL);
export const RPCS = IS_FORK ? [RPC_URL] : [RPC_URL, 'https://xlayerrpc.okx.com'];
/**
 * TapeOut reads (netlists, circuitInfo, eval, stats) always use public X Layer mainnet RPCs.
 * On a local fork those reads are identical, and going through the fork node would make it
 * fetch remote state call by call. MiterCourt and transactions use RPCS.
 */
export const TAPEOUT_RPCS = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
export const COURT = (process.env.NEXT_PUBLIC_MITER_COURT_ADDRESS || '') as Hex | '';
export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://web3.okx.com/explorer/x-layer').replace(/\/$/, '');

export const explorerTx = (h: string) => (IS_FORK ? undefined : `${EXPLORER}/tx/${h}`);
export const explorerAddr = (a: string) => (IS_FORK ? undefined : `${EXPLORER}/address/${a}`);

import type { Bounty } from './chain';

export function relTime(unixSec: number, now = Date.now() / 1000) {
  const d = unixSec - now;
  const a = Math.abs(d);
  const unit = a < 3600 ? [Math.round(a / 60), 'min'] : a < 86400 ? [Math.round(a / 3600), 'h'] : [Math.round(a / 86400), 'd'];
  return d >= 0 ? `in ${unit[0]} ${unit[1]}` : `${unit[0]} ${unit[1]} ago`;
}

/** What the board shows: an Open bounty past expiry is Expired (funder may withdraw). */
export function displayStatus(b: Bounty, now = Date.now() / 1000): string {
  if (b.state === 'Open') return b.expiry < now ? 'Expired' : 'Bonded';
  if (b.state === 'Paid') return 'Broken';
  return b.state;
}

export function inputSpace(nIn: number) {
  return nIn <= 30 ? (2 ** nIn).toLocaleString('en-US') : `2^${nIn}`;
}

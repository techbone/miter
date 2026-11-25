/**
 * Drives the built web app in the locally installed Chrome (playwright-core, no
 * browser download) against a seeded X Layer fork. Injects an EIP-1193 provider
 * that forwards to the fork node, where the hunter account is impersonated, so
 * the real claim flow runs end to end. Saves screenshots to docs/evidence/ui/.
 *
 *   tsx ui-check.ts [baseUrl=http://localhost:4173]
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { encodeFunctionData, parseEther, toHex } from 'viem';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'http://localhost:4173';
const seed = JSON.parse(readFileSync(resolve(root, 'scripts/.fork-seed.json'), 'utf8'));
const shots = resolve(root, 'docs/evidence/ui');
mkdirSync(shots, { recursive: true });

const provider = (addr: string) => `
  (() => {
    const L = {};
    window.ethereum = {
      on: (e, f) => ((L[e] ??= []).push(f)),
      removeListener: () => {},
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${addr}'];
        if (method === 'eth_chainId') return '0xc4';
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        const r = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json());
        if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; e.data = r.error.data; throw e; }
        return r.result;
      },
    };
  })();`;

const errors: string[] = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

async function page(scheme: 'dark' | 'light', viewport = { width: 1280, height: 900 }, wallet = true): Promise<Page> {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
  if (wallet) await ctx.addInitScript(provider(seed.hunter));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${p.url()}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${p.url()}] pageerror ${e.message}`));
  return p;
}
const t0 = Date.now();
const step = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${s}`);

// 1. Home (dark + light)
for (const scheme of ['dark', 'light'] as const) {
  const p = await page(scheme);
  await p.goto(`${BASE}/`);
  await p.getByText('#').first().waitFor();
  await p.locator('table tbody tr').nth(1).waitFor({ timeout: 60_000 });
  await p.waitForFunction(() => !document.body.innerText.includes('Circuits on X Layer\n—'), null, { timeout: 60_000 }).catch(() => step('stats still loading (fork is slow); continuing'));
  await p.screenshot({ path: `${shots}/home-${scheme}.png`, fullPage: true });
  step(`home (${scheme}) ok`);
  await p.context().close();
}

// 2. Hunt: counterexample + equivalence, no wallet needed
{
  const p = await page('dark', undefined, false);
  await p.goto(`${BASE}/hunt/`);
  await p.getByRole('button', { name: /AND vs NAND/ }).click();
  await p.getByText('Counterexample', { exact: true }).waitFor({ timeout: 120_000 });
  await p.screenshot({ path: `${shots}/hunt-counterexample.png`, fullPage: true });
  step('hunt: counterexample found and confirmed on processors');
  await p.getByRole('button', { name: /8-bit adders/ }).click();
  await p.getByText('No input separates').waitFor({ timeout: 120_000 });
  await p.screenshot({ path: `${shots}/hunt-equivalent.png`, fullPage: true });
  step('hunt: equivalence proved');
  await p.context().close();
}

// 3. Open a fresh claimable bounty (AND vs NAND), then claim it through the UI with the injected wallet
const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json());
  if (r.error) throw new Error(r.error.message);
  return r.result;
};
const abi = JSON.parse(readFileSync(resolve(root, 'contracts/artifacts/contracts/MiterCourt.sol/MiterCourt.json'), 'utf8')).abi;
const block = await rpc('eth_getBlockByNumber', ['latest', false]);
const openTx = await rpc('eth_sendTransaction', [{
  from: seed.funder, to: seed.court, value: toHex(parseEther('0.25')),
  data: encodeFunctionData({ abi, functionName: 'open', args: ['0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6', 3522n, '0x60918C204F3c94630D3D793738Fc36293c8405D6', 1010n, Number(block.timestamp) + 72 * 3600] }),
}]);
while (!(await rpc('eth_getTransactionReceipt', [openTx]))) await new Promise((r) => setTimeout(r, 500));
const count = BigInt(await rpc('eth_call', [{ to: seed.court, data: encodeFunctionData({ abi, functionName: 'bountyCount', args: [] }) }, 'latest']));
step(`opened fresh bounty #${count}`);
{
  const p = await page('dark');
  await p.goto(`${BASE}/bounty/?id=${count}`);
  await p.getByRole('button', { name: 'Find a breaking input' }).click();
  await p.getByRole('button', { name: /Commit and claim/ }).waitFor({ timeout: 120_000 });
  step('claim: input found');
  await p.getByRole('button', { name: /Commit and claim/ }).click();
  await p.getByText(/paid .* OKB to you/).waitFor({ timeout: 180_000 });
  await p.screenshot({ path: `${shots}/claim-verified.png`, fullPage: true });
  step('claim: committed, revealed, verified on-chain');
  await p.reload();
  await p.getByText('Winning input').waitFor({ timeout: 60_000 });
  await p.screenshot({ path: `${shots}/bounty-paid.png`, fullPage: true });
  step('bounty page shows Paid state from chain');
  await p.context().close();
}

// 4. Bond-only bounty + circuit page + mobile
{
  const p = await page('light');
  await p.goto(`${BASE}/bounty/?id=2`);
  await p.getByText('Both netlists still match').waitFor({ timeout: 60_000 });
  await p.screenshot({ path: `${shots}/bounty-bonded-light.png`, fullPage: true });
  await p.goto(`${BASE}/circuit/?c=0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6:3522`);
  await p.getByText('Check on the processor').waitFor({ timeout: 60_000 });
  await p.getByText('Check on the processor').click();
  await p.getByText('matches the simulator').waitFor({ timeout: 60_000 });
  await p.screenshot({ path: `${shots}/circuit-light.png`, fullPage: true });
  step('circuit page: simulator matches processor');
  await p.context().close();

  const m = await page('dark', { width: 390, height: 844 });
  await m.goto(`${BASE}/hunt/?target=0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6:3522&spec=0x60918C204F3c94630D3D793738Fc36293c8405D6:1010`);
  await m.getByText('Counterexample', { exact: true }).waitFor({ timeout: 120_000 });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await m.screenshot({ path: `${shots}/mobile-hunt.png`, fullPage: true });
  step(`mobile hunt ok · horizontal overflow: ${overflow}`);
  if (overflow) errors.push('mobile: horizontal page overflow');
  await m.context().close();
}

await browser.close();
console.log(errors.length ? `\nCONSOLE ERRORS (${errors.length}):\n${errors.join('\n')}` : '\nUI CHECK PASSED · no console errors');
process.exit(errors.length ? 1 : 0);

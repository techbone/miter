# Build log

Each entry records what surprised us, the dead end, the path we chose and the test that guards it. This log feeds the README's "hard problem" section and the launch thread.

## 2026-11-17: TapeOut is not on X Layer testnet
- **Surprise:** TapeRNG's README says X Layer testnet (1952) has only a `MockTapeOutCPU`, and there is no real TapeOut there.
- **Path:** develop and test against a fork of X Layer mainnet, which gives us the real processors and real circuits for free. Deploy to mainnet only for the submission.
- **Guard:** the fork tests in `contracts/test` call real processor addresses read from the factory.

## 2026-11-17: what X Layer actually costs (measured, not guessed)
- `eth_gasPrice` returns 0.020000001 gwei, and `GasPriceOracle.getL1Fee` returns 0 for both a 12 KB and a 400 B payload. OKB was $86.69.
- Deploying 2.5M gas costs about $0.0043, a claim that evaluates 3,000 gates (about 7M gas) costs about $0.012, and a 100k-gas transaction costs about $0.00017.
- `TAPEOUT_FEE` on X Layer processor `0x839bdD6fa7A66416A609A735e11DE5411B98574e` is 0.0013 OKB (about $0.11). TAP-02 lists 0.0002 BNB for BSC, so the fee differs per chain.
- The factory reports 425 processors, and the first 40 hold 350 circuits.
- **Decision:** the whole event's on-chain budget is under $1, and Miter never needs to tape out to work.

## 2026-11-17: the factory is not sealed
- **Surprise:** TAP-02 §3 and TAP-10 say none of the contracts is sealed, and a beacon upgrade could change stored netlists.
- **Path:** `MiterCourt` pins `keccak256(netlist(id))` when a bounty opens and re-checks it on reveal. A mismatch voids the bounty instead of paying out.
- **Guard:** `contracts/test/MiterCourt.fork.test.ts`, "voids instead of paying when a netlist changes after open". It etches a stand-in over a real processor address, then checks that the reveal voids the bounty, the Broken flag stays clear, and the funder recovers the stake.

## 2026-11-17: our simulator matches the live processors bit for bit
- `scripts/verify-sim.ts` sampled 60 random circuits from the 11,573 on X Layer (425 processors, 218 of them non-empty) and ran 8 random vectors through each. Stateful circuits also got random state, compared on both `newState` and outputs through `step`.
- **Result: 480/480 vectors matched, 0 mismatches.** The sample included a 636-bit-state circuit, REF circuits whose state blocks live inside sub-circuits, a REF to a circuit with zero inputs, and circuits of 1,000+ gates. Evidence: `docs/evidence/sim-vs-eval.json`.
- **Surprise:** the run took 520 s over public RPC, because circuit loads are sequential and every one is an `eth_call`. **Path for the app:** load on demand with an IndexedDB cache keyed by circuit, and never crawl all 425 processors in the browser.
- **Lead for M4:** processor `0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6` holds about 7,000 circuits, and many share pin counts and gate counts (for example many 4→4 circuits with 20 gates, and 18→17 circuits with LATCH state). These look like several miners solving the same PoD problems, which is exactly what a miter can cross-check.
- **Decision (contracts):** downloading Foundry binaries into `~/.foundry` was blocked in this environment, so the contracts use repo-local Hardhat forking X Layer mainnet instead. It runs the same real processors with no global install.

## 2026-11-17: well-known dev keys are booby-trapped on X Layer mainnet
- **Surprise:** in fork tests, every payout to Hardhat's default accounts reverted with `TransferFailed()`. `eth_getCode(0x7099…79c8)` on X Layer returns `0xef0100200637…`, an **EIP-7702 delegation** to a sweeper contract. Anyone who ever used those public keys on mainnet had them hijacked, and the hijacked code rejects plain value transfers.
- **Path:** tests use fresh random accounts (impersonated and funded), never the well-known ones. The e2e and deploy scripts do the same.
- **Product lesson:** a hunter whose address rejects OKB cannot be paid, so the claim reverts, and their commitment stays unused for a retry from a clean address. Push payments stay simple, and nobody else is harmed.
- **Guard:** `freshAccount()` in the fork tests. All 11 tests pass against real processors.

## 2026-11-17: what a real claim costs
- A reveal that re-evaluates two live circuits and pays out uses **219,326 gas**, about **$0.0004** at 0.02 gwei.
- The first live fixture pair is processor `0x87BF…:3522` (AND, 4 NANDs) against `0x6091…:1010` (NAND, 3 NANDs). They are complements, so MiniSat's counterexample `0x00` breaks them, and every other input does too. The identical pair `0x6091…:1010` and `0x87BF…:2054` (same netlist hash) is the "no counterexample exists" fixture.

## 2026-11-17: the web app, checked in a real browser
- **Static export, zero servers.** MiniSat runs in a Web Worker, netlists are cached in IndexedDB, and bounty history is read at the exact `openedBlock`/`settledBlock` the contract records. Public RPCs cap log ranges, so this avoids needing an indexer.
- **Surprise 1:** `router.replace()` in a static export remounted the Hunt page and silently dropped the run's state, so a click did nothing and logged no error. **Path:** `history.replaceState`.
- **Surprise 2:** routing TapeOut reads through a local fork made the home stats take 180 s, because the fork fetches remote state one call at a time. **Path:** TapeOut reads (netlists, `eval`, stats) always use public mainnet RPCs, and only MiterCourt and transactions use the configured network. Home now loads in about 6 s.
- **Surprise 3:** a Hardhat fork only mines on transactions, while X Layer mines about every second, so "wait one block" hung. **Path:** `evm_setIntervalMining 1000` in `scripts/seed-fork.ts`, which mirrors the real chain.
- **Surprise 4:** after a successful claim, the reload from chain flipped the bounty to Paid and unmounted the claim panel, which hid the "Verified on-chain" step. **Path:** keep the completed steps visible.
- **Guard:** `scripts/ui-check.ts` drives the installed Chrome through playwright-core, with no browser download. An injected EIP-1193 provider forwards to the fork node, where the hunter is impersonated. It covers home in dark and light, both hunt outcomes, a fresh bounty claimed through the UI (commit, then reveal 2.5 s later, verified on-chain), the Paid view, the circuit simulator against `eval`, and mobile at 390 px with no overflow. **Result: passed with 0 console errors.** Screenshots are in `docs/evidence/ui/`.
- **Open question:** the home page counted 11,456 circuits, but `verify-sim` counted 11,573 earlier the same day. Circuits can't disappear, so one of the two reads is off. Investigate before quoting the number anywhere.

## 2026-11-25: live on X Layer mainnet
- `pnpm e2e --mainnet --broadcast` deployed **MiterCourt `0xc4cfeffa91b6d70113bcab9008dea976ced58241`** (1,821,409 gas) and opened bounty #1 with 0.0005 OKB: AND `0x87BF…F9a6:3522` must equal NAND `0x6091…05D6:1010`. A fresh hunter then committed and revealed `0x00` (224,379 gas). The contract re-ran both circuits on the real processors, got `0x00` against `0x01`, and paid 0.000475 OKB with a 0.000025 fee. Reveal tx `0x0a57840d2f5acaf8aa8234481cc8bc0f2a57c5776324e6e64994242a06575b1b`. Evidence: `docs/evidence/e2e-xlayer-mainnet-1795604973070.json`.
- **Surprise:** the sandbox blocks sending mainnet transactions from the agent, even with a funded throwaway key. **Path:** the e2e creates and funds its own hunter key and saves the court address to `.env`, so a person runs one command.
- **Surprise:** Vercel built the site and then refused to publish it with "Vulnerable version of Next.js detected". **Path:** Next 15.1.6 → 15.5.29, the maintained 15.x backport line, and React 19.0.0 → 19.0.9. The static export is unchanged.
- **Surprise:** on mainnet the home board took about 6 s, because viem batches by URL, so the bounty reads queued behind the ~900-read stats scan to the same RPC. **Path:** load bounties first, then stats. Rows now appear at about 4 s.
- The network grew to 450 processors and 11,763 circuits (from 425 and 11,573 on Nov 17). The two numbers drift, so the UI states them as live, and the README quotes them with a date.

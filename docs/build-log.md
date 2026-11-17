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
- **Guard:** TBD (fork test with an etched processor).

## 2026-11-17: our simulator matches the live processors bit for bit
- `scripts/verify-sim.ts` sampled 60 random circuits from the 11,573 on X Layer (425 processors, 218 of them non-empty) and ran 8 random vectors through each. Stateful circuits also got random state, compared on both `newState` and outputs through `step`.
- **Result: 480/480 vectors matched, 0 mismatches.** The sample included a 636-bit-state circuit, REF circuits whose state blocks live inside sub-circuits, a REF to a circuit with zero inputs, and circuits of 1,000+ gates. Evidence: `docs/evidence/sim-vs-eval.json`.
- **Surprise:** the run took 520 s over public RPC, because circuit loads are sequential and every one is an `eth_call`. **Path for the app:** load on demand with an IndexedDB cache keyed by circuit, and never crawl all 425 processors in the browser.
- **Lead for M4:** processor `0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6` holds about 7,000 circuits, and many share pin counts and gate counts (for example many 4→4 circuits with 20 gates, and 18→17 circuits with LATCH state). These look like several miners solving the same PoD problems, which is exactly what a miter can cross-check.
- **Decision (contracts):** downloading Foundry binaries into `~/.foundry` was blocked in this environment, so the contracts use repo-local Hardhat forking X Layer mainnet instead. It runs the same real processors with no global install.

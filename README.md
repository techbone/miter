# Miter

<!-- badges: fill with true numbers only -->
`tests-TBD` · `rails-X Layer mainnet (196)` · `TapeOut processors` · `live-TBD`

### On TapeOut, a bug proves itself.

Miter is a correctness market for TapeOut circuits that needs no judge. You stake money behind a circuit's spec, a SAT solver in your browser hunts for an input that breaks it, and the contract pays the hunter once it has re-run the real circuit on X Layer. The broken circuit is flagged on-chain, so anything that depends on it can fail closed.

**Watch the demo** (TBD) · **Live app** (TBD) · **Verify it yourself** (below) · **[Architecture](ARCHITECTURE.md)** · **Run it locally** (below)

## Demo
TBD: embedded video, its length, and what it shows.

## Verify it yourself in 60 seconds
TBD: `cast call` against MiterCourt, explorer links, `pnpm test`, `pnpm e2e` with expected output.

## Contents
TBD

## The problem
See [ARCHITECTURE.md §2](ARCHITECTURE.md#2-problem). TBD: a short version here.

## What it does
TBD: capability | what the user does | exact TapeOut calls.

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md).

## The hard problem
TBD (from `docs/build-log.md`).

## What's real vs simplified
| Capability | How it's backed | Status |
|---|---|---|
| TBD | | |

## Engineering decisions
TBD

## Tech stack and project layout
```
apps/web/        Next.js static app (explorer, bounties, in-browser hunting)
packages/core/   TAP-02 parser and simulator, chain reads, miter CNF, MiniSat adapter
contracts/       Foundry: MiterCourt + tests on an X Layer mainnet fork
scripts/         headless e2e and probes
docs/            build log, evidence, demo script, submission
```

## Run it locally
TBD

## Known limitations and disclosure
Built for X Layer TapeOut Accelerate (Build X Series). First commit: 2026-11-17. The contracts are unaudited and only ever hold demo-sized stakes. Nothing here is financial advice.

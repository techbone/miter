# AGENTS.md — rules for every session on Miter

Read `ARCHITECTURE.md` first. Keep it updated when a decision changes.

## Hard constraints
- **Zero paid infrastructure.** No database, no backend server, no paid cache. The chain stores state, the browser does the compute, IndexedDB is the cache, and hosting is a free static tier. A feature that needs a server needs a new plan first.
- **Real rails only.** Use the real TapeOut processors on X Layer mainnet (chain 196) or a fork of mainnet. TapeOut is not deployed on X Layer testnet 1952, so never mock a processor in tests.
- **Spend nothing by accident.** Scripts that send transactions default to dry run and need `--broadcast`. Keys live only in `.env`, which is git-ignored.
- **Commits:** short conventional, lowercase, one line (`feat: add miter cnf`). No body unless truly needed. Never add `Co-Authored-By` or "Generated with" lines.

## TapeOut gotchas (TAP-02 / TAP-10)
- Signal 0 is the constant 0, signal 1 is the constant 1, input `i` is signal `2+i`, and element outputs follow in record order. The outputs are the **last `nOut` signals**.
- Records: NAND `0x00 a:u24 b:u24` (7 bytes), LATCH `0x01 d:u24` (4 bytes), REF `0x02 cpu:20 id:u64 nIns:u8 nOuts:u8 ins:u24×nIns`. Indices are big-endian u24.
- Bits are packed **LSB first**: bit `i` is `(byte[i>>3] >> (i&7)) & 1`. Outputs are exactly `ceil(nOut/8)` bytes with zero padding, and inputs are read leniently.
- A LATCH outputs the **previous** state, and its new value is `s[d]` after the whole pass. `eval` reverts with `has latch: use step` when `nState > 0`.
- A REF circuit may live on any processor registered with the factory (`isCPU`), so a netlist can pull in other processors' circuits. Load dependencies recursively.
- The factory is **not sealed**, so netlists behind the beacon could change. Pin `keccak256(netlist)` wherever trust matters.
- On X Layer, `TAPEOUT_FEE` is 0.0013 OKB (it is 0.0002 BNB on BSC). Evaluation costs about 2,317 gas per gate, and the X Layer block gas limit is 210M.
- X Layer gas is around 0.02 gwei, and `GasPriceOracle.getL1Fee` returns 0.
- Factory `0x1f09DAeFA827f02CBb40967cc91b259763760761`. Container opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`. SiteRegistry `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6`. DeWEB hub `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`.

## Stack gotchas
- The Next.js app is a static export (`output: 'export'`). Use query-parameter routes (`/circuit?c=0x…:12`), not dynamic segments.
- The SAT solver (`logic-solver`) runs in a Web Worker in the browser, so never block the main thread. In Node it runs inline.
- Everything in `packages/core` must run in both Node and the browser: no `fs` or `process` in core.

## Design rules (the UI must not look AI-generated)
Reference feel: Linear, Vercel, Stripe, Raycast. The product is a hardware-verification instrument, and it should read like one.

**Type**
- IBM Plex Sans for headings and body. Headings use weight 600 and tracking `-0.02em` at 28px and above.
- IBM Plex Mono for every number, address, hash, bit string and gate count, always with `font-variant-numeric: tabular-nums`.
- Scale (px): 12 / 13 / 14 / 16 / 20 / 28 / 40. Body text is 14, UI labels are 13.

**Color tokens** (CSS variables, with a designed dark mode rather than an inverted one)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF8` | `#0B0C0E` | page |
| `--surface` | `#FFFFFF` | `#121317` | cards, tables |
| `--surface-2` | `#F3F2EF` | `#191A1F` | hover, insets |
| `--border` | `#E4E2DD` | `#24262C` | 1px rules |
| `--text` | `#141414` | `#E8E9EB` | primary text |
| `--muted` | `#6B6A66` | `#8B9099` | secondary text |
| `--accent` | `#B4561F` | `#E0773A` | copper: the single accent (actions, Bonded) |
| `--broken` | `#C93A3A` | `#F06363` | Broken status, differing bits |
| `--proven` | `#2C8A5F` | `#4CC38A` | Proven status, matching bits |

- Every other color is neutral. No gradients, no gradient text, no glow, no glassmorphism.

**Shape and space**
- Radii: 6px for controls, 10px for cards, 999px only for status pills.
- Shadows: none in dark mode. In light mode use at most `0 1px 2px rgba(0,0,0,.04)`. Prefer 1px borders.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Content max width is 1120px, on a 12-column grid.

**Components**
- Status pills: `Open`, `Bonded`, `Broken`, `Proven`, `Voided`. Each is a small dot plus a label, never an emoji.
- Show a bit or input as a **bit strip** of monospace cells, MSB to LSB, with differing output bits marked in `--broken`. This is the signature visual, so reuse it.
- Every on-chain action shows named steps (Find input → Commit → Wait one block → Reveal → Verified on-chain) with transaction hashes linked to the explorer. Never use a single spinner.
- Tables are dense, numbers are right-aligned, and every table has empty, loading and error states.
- Icons: Lucide only, at 16px, stroke 1.5, in the muted color.

**Copy and motion**
- Write plain, specific copy for the user. Never use "unlock", "seamless", "revolutionize", "next-gen", "AI-powered", or sparkles.
- Use motion only where it carries meaning, such as a step completing or a bit flipping. Keep it to 150–200ms ease-out.
- Before calling a screen done, ask whether anyone would guess an AI made it. If so, fix it.

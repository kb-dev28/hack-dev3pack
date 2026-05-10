# EverYield (`hack-dev3pack`)

**EverYield** is a hackathon-style MVP on Solana: a **non-custodial PDA vault** (native SOL lamports) plus **Smart Send** — pay a recipient an amount expressed in **crypto or fiat**, converted with **Pyth Hermes** (mainnet spot prices) while funds stay in the vault narrative until you send. Built on Next.js, `@solana/kit`, and an **Anchor** vault program.

> Naming note: internal planning docs still say *YieldLink*; the shipped UI and header brand are **EverYield**.

## Getting started

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/hack-dev3pack
```

```shell
npm install
npm run setup   # Builds the Anchor program and generates the TypeScript client (Codama)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and use the vault + Smart Send.

**Phantom / Wallet Standard:** the app uses CAIP-2 chain ids (e.g. devnet `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`), not `solana:devnet`. Pick the **same cluster** in the wallet as in the app header. For localnet, set `NEXT_PUBLIC_LOCALNET_WALLET_CHAIN` to `solana:` + the first 32 characters of `solana genesis-hash -u http://127.0.0.1:8899` if signing fails.

## Devnet program (contract address)

| Item        | Value |
| ----------- | ----- |
| **Program ID** | `AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf` |
| **Cluster**    | Devnet (default in UI) |
| **Explorer**   | [Solana Explorer — program](https://explorer.solana.com/address/AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf?cluster=devnet) |

If you deploy your own program, run `anchor keys sync`, rebuild, deploy, then `npm run setup` so the generated client matches your ID.

## What’s in the MVP (UI + program)

- **Site header** — EverYield + tagline, help (?) with product tooltip, theme + cluster + wallet; Pyth ratio still appears inside the help tooltip when Hermes data is loaded.
- **Wallet card** — balance, truncated **address + copy** on the top row; on non-mainnet, a compact **devnet airdrop** action under the SOL line.
- **Vault** — deposit; withdraw **partial** or **total** (close); balance display framed as **JitoSOL** with SOL headline + optional **simulated** yield tick driven by Pyth ratio (`useSimulatedJitoYield`).
- **Smart Send** — recipient + amount in a chosen reference (default **ETH** in crypto mode to avoid redundant SOL); Hermes-backed conversion; optional **protocol fee** (see env below); validation UX (e.g. highlight recipient when amount is set but address is empty).
- **Toasts** with explorer links; readable errors for common Solana / program failures.
- **Codama-generated** type-safe client under `app/generated/vault/`.
- **Tailwind CSS v4**, light/dark.

Instructions on-chain today: **deposit**, **withdraw** (full to signer + close), **withdraw_partial**, **send_to** (owner-signed transfer from vault PDA to any recipient, respecting rent).

## Pyth (this repo)

- The **program does not** read Pyth accounts; pricing is **off-chain** via `@pythnetwork/hermes-client` (`getLatestPriceUpdates`, `parsed: true`) against `https://hermes.pyth.network` for feeds configured in `app/lib/pyth/constants.ts` (e.g. SOL/USD, JITOSOL/USD).
- Hook: `app/lib/hooks/use-pyth-jitosol-quote.ts` (SWR, ~2s refresh).
- Optional env: `NEXT_PUBLIC_PYTH_HERMES_URL` to override the Hermes base URL.
- `@pythnetwork/pyth-solana-receiver` is a dependency for a possible future **on-chain** Pull Oracle path; the current MVP does not post price updates inside the program.

## Configuration (`.env`)

See [`.env.example`](./.env.example). Notable:

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_PROTOCOL_TREASURY` | Optional treasury pubkey; if set, Smart Send splits a **tiny fee** (see `app/lib/protocol-fee.ts`) from the gross lamports in the same transaction. |
| `NEXT_PUBLIC_PYTH_HERMES_URL` | Optional Hermes endpoint override. |

Never commit real private keys or keypair JSON.

## Stack

| Layer          | Technology |
| -------------- | ---------- |
| Frontend       | Next.js 16, React 19, TypeScript |
| Styling        | Tailwind CSS v4 |
| Solana client  | `@solana/kit`, wallet-standard |
| Program client | Codama-generated from Anchor IDL |
| Program        | Anchor (Rust) |
| Prices (MVP)   | Pyth Hermes (`@pythnetwork/hermes-client`), SWR |

## Project structure (high level)

```
app/
  components/          # UI: vault-card, site-chrome-header, wallet-button, cluster-select, …
  generated/vault/     # Codama client
  lib/
    pyth/              # Hermes fetch + send conversion helpers
    hooks/             # balances, send tx, Pyth quote, simulated yield, …
    protocol-fee.ts    # Optional Smart Send fee (ppm)
anchor/
  programs/vault/      # Anchor program + LiteSVM tests
codama.json
```

## Local development (local validator)

1. `solana-test-validator`
2. `solana config set --url localhost` → `cd anchor && anchor build && anchor deploy` → `cd .. && npm run codama:js`
3. Select **localnet** in the app header.

## Testing

```bash
npm run anchor-build
npm run anchor-test
```

Tests live in `anchor/programs/vault/src/tests.rs` (LiteSVM).

## Regenerating the client

After IDL / program changes:

```bash
npm run setup   # or: npm run anchor-build && npm run codama:js
```

## Internal docs (`docs/internal/`)

That folder is **listed in `.gitignore`** — it is **not** part of a normal GitHub clone. Locally you may still have notes such as:

| File | Contents (summary) |
| ---- | -------------------- |
| `idea-mvp.md` | Original product concept (YieldLink narrative, judge flow, JitoSOL + Pyth story). |
| `roadmap-mvp.md` | Phased checklist (many items are already reflected in the current codebase). |
| `sdk-pyth.md` | Hermes-only UI vs future on-chain Pull Oracle; env vars; feed pointers → see `app/lib/pyth/`. |
| `hackathon.md` | Track notes (e.g. qualification: unique Rust program on devnet, README with program address, public repo, demo video + live link). |
| `primer-deploy.md` | Operator scratch (deploy log). **Do not** paste keypair material into the public README. |

For anything judges or open contributors must read, prefer a **public** doc path (e.g. `docs/public/`) without secrets.

## If something is missing for a full hackathon submission

Add these yourself when you have them (they are **not** in the internal notes as stable values):

- **Live demo URL** (e.g. Vercel) and **demo video** link (often required, usually under 3 minutes).
- **Explicit feed IDs** in the README if you want judges to verify Hermes mappings without opening `constants.ts`.
- **Team / repo** links and any **sponsor-specific** checklist beyond the generic Solana track bullets.

---

## Learn more

- [Solana Docs](https://solana.com/docs)
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction)
- [Pyth Network Docs](https://docs.pyth.network/)
- [@solana/kit](https://github.com/anza-xyz/kit)
- [Codama](https://github.com/codama-idl/codama)

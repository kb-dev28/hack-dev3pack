# EverYield (`hack-dev3pack`)

**Project name:** **EverYield**  
**Description:** Non-custodial Solana **PDA vault** (native SOL) with **Smart Send**: pay a recipient using an amount in **crypto or fiat**, converted off-chain with **Pyth Hermes** (mainnet spot prices). Frontend: Next.js + `@solana/kit` + wallet-standard. On-chain: **Anchor** (Rust).

---

## Live demo & repository

| | Link |
| --- | --- |
| **Live demo (Vercel)** | [https://hack-dev3pack.vercel.app/](https://hack-dev3pack.vercel.app/) |
| **Demo video** | *Add your public video URL here (keep under ~3 minutes per track rules).* |
| **Public GitHub repo** | [github.com/kb-dev28/hack-dev3pack](https://github.com/kb-dev28/hack-dev3pack) |

### For judges (no install)

Open the **live demo** link, set the wallet to **Devnet** (same as the app header), connect, and use the vault + Smart Send. **No** clone, **no** Anchor, and **no** deploy required on your machine.

### For developers cloning this repo

Use this when someone wants to **run or modify** the app locally (hackathon “README + setup instructions”):

```shell
git clone https://github.com/kb-dev28/hack-dev3pack.git
cd hack-dev3pack
npm install
npm run dev
```

The Codama client under `app/generated/vault/` is **committed**, so `npm run dev` is enough for a local UI that talks to **devnet** with the program ID in this README.

Run **`npm run setup`** (needs [Rust](https://rustup.rs/) + [Anchor](https://www.anchor-lang.com/docs/installation) + Solana CLI) only after you **change the Anchor program or `declare_id!`**, so the generated client matches your build.

Official template bootstrap (optional):

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/hack-dev3pack
```

**Phantom / Wallet Standard:** CAIP-2 chain ids (e.g. devnet `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`), not `solana:devnet`. For localnet from the browser, see `NEXT_PUBLIC_LOCALNET_WALLET_CHAIN` in [`.env.example`](./.env.example).

---

## Solana program — contract address (devnet)

**Requirement:** unique program in **Rust** (Anchor), deployed to **devnet** — address is stated here for judges and tooling.

| Item | Value |
| --- | --- |
| **Program ID** | `AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf` |
| **Cluster** | Devnet |
| **Source** | `anchor/programs/vault/src/lib.rs` (`declare_id!` matches the table above) |
| **Explorer** | [Program on Solana Explorer](https://explorer.solana.com/address/AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf?cluster=devnet) |

If you deploy a **new** program: `anchor keys sync` → rebuild → deploy → `npm run setup` so `app/generated/vault/` matches your ID.

---

## Solana track checklist (quick reference)

- [x] **Project name + short description** — top of this README.  
- [x] **Unique Solana program (Rust)** — Anchor vault in `anchor/programs/vault/`.  
- [x] **Contract address on devnet** — table above.  
- [x] **Public GitHub + README + setup** — clone + `npm install` + `npm run dev`; `npm run setup` when changing on-chain code.  
- [ ] **Demo video** — add URL in the table when ready.  
- **Bonus:** `@solana/kit`, wallet-standard, Codama client, Anchor + LiteSVM tests.

---

## Environment variables (`.env`)

**Vercel:** no `.env` required for defaults (Hermes URL in `app/lib/pyth/constants.ts`; protocol fee off until you set a treasury).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PYTH_HERMES_URL` | Optional Hermes base URL override. |
| `NEXT_PUBLIC_PROTOCOL_TREASURY` | Optional Smart Send fee recipient (`app/lib/protocol-fee.ts`). |
| `NEXT_PUBLIC_LOCALNET_WALLET_CHAIN` | Only if you use **localnet** from the browser. |

Details: [`.env.example`](./.env.example). Never commit private keys or deploy keypairs.

---

## What’s in the MVP

- **Header** — EverYield, tagline, help tooltip (incl. Pyth ratio when loaded), theme, cluster, wallet.  
- **Wallet** — balance, address + copy; devnet airdrop helper when not on mainnet.  
- **Vault** — deposit; partial / total withdraw; JitoSOL-framed balance + simulated yield tick (`useSimulatedJitoYield`).  
- **Smart Send** — recipient + amount (default ref **ETH** in crypto mode); Hermes conversion; optional fee; recipient highlight when amount set but address empty.  
- **Instructions:** `deposit`, `withdraw`, `withdraw_partial`, `send_to`.  
- **Pyth** — Hermes in the frontend only; the program does **not** read Pyth accounts (`app/lib/pyth/`, `use-pyth-jitosol-quote.ts`).

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Solana client | `@solana/kit`, wallet-standard |
| Program client | Codama → `app/generated/vault/` |
| Program | Anchor (Rust) |
| Prices | `@pythnetwork/hermes-client`, SWR |

---

## Project structure (high level)

```
app/
  components/       # vault-card, site-chrome-header, wallet-button, cluster-select, …
  generated/vault/  # Codama client (commit this for Vercel)
  lib/              # pyth/, hooks/, protocol-fee.ts, wallet/, …
anchor/
  programs/vault/   # Anchor program + LiteSVM tests
codama.json
```

---

## Local validator

1. `solana-test-validator`  
2. `solana config set --url localhost` → `cd anchor && anchor build && anchor deploy` → `cd .. && npm run codama:js`  
3. Select **localnet** in the app.

## Testing

```bash
npm run anchor-build
npm run anchor-test
```

`anchor/programs/vault/src/tests.rs` (LiteSVM).

## Regenerate client after IDL changes

```bash
npm run setup
```

---

## Internal docs (`docs/internal/`)

Not pushed to GitHub (`.gitignore`). Local reference only:

| File | Contents |
| --- | --- |
| [`idea-mvp.md`](./docs/internal/idea-mvp.md) | Product concept (EverYield). |
| [`roadmap-mvp.md`](./docs/internal/roadmap-mvp.md) | Phased checklist. |
| [`sdk-pyth.md`](./docs/internal/sdk-pyth.md) | Hermes UI vs on-chain Oracle. |
| Other | Hackathon notes, deploy log — no secrets in public README. |

---

## Learn more

- [Solana Docs](https://solana.com/docs)  
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction)  
- [Pyth Docs](https://docs.pyth.network/)  
- [@solana/kit](https://github.com/anza-xyz/kit)  
- [Codama](https://github.com/codama-idl/codama)

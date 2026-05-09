# hack-dev3pack

Next.js starter with Tailwind CSS, `@solana/kit`, and an Anchor vault program example.

## Getting Started

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/hack-dev3pack
```

```shell
npm install
npm run setup   # Builds the Anchor program and generates the TypeScript client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and interact with the vault.

**Phantom / Wallet Standard:** the app uses CAIP-2 chain ids (e.g. devnet `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`), not `solana:devnet`. Pick the **same cluster** in Phantom (e.g. Devnet) as in the app header. For localnet, set `NEXT_PUBLIC_LOCALNET_WALLET_CHAIN` to `solana:` + the first 32 characters of `solana genesis-hash -u http://127.0.0.1:8899` if signing fails.

## What's Included

- **Wallet connection** via wallet-standard with auto-discovery and dropdown UI
- **Cluster switching** — devnet, testnet, mainnet, and localnet from the header
- **Wallet balance** display with airdrop button (devnet/testnet/localnet)
- **SOL Vault program** — deposit and withdraw SOL from a personal PDA vault
- **Toast notifications** with explorer links for every transaction
- **Error handling** — human-readable messages for common Solana and program errors
- **Codama-generated client** — type-safe program interactions using `@solana/kit`
- **Tailwind CSS v4** with light/dark mode toggle

## Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Frontend       | Next.js 16, React 19, TypeScript |
| Styling        | Tailwind CSS v4                  |
| Solana Client  | `@solana/kit`, wallet-standard   |
| Program Client | Codama-generated, `@solana/kit`  |
| Program        | Anchor (Rust)                    |

## Project Structure

```
├── app/
│   ├── components/
│   │   ├── cluster-context.tsx  # Cluster state (React context + localStorage)
│   │   ├── cluster-select.tsx   # Cluster switcher dropdown
│   │   ├── grid-background.tsx  # Solana-branded decorative grid
│   │   ├── providers.tsx        # Wallet + theme providers
│   │   ├── theme-toggle.tsx     # Light/dark mode toggle
│   │   ├── vault-card.tsx       # Vault deposit/withdraw UI
│   │   └── wallet-button.tsx    # Wallet connect/disconnect dropdown
│   ├── generated/vault/        # Codama-generated program client
│   ├── lib/
│   │   ├── wallet/             # Wallet-standard connection layer
│   │   │   ├── types.ts        # Wallet types
│   │   │   ├── standard.ts     # Wallet discovery + session creation
│   │   │   ├── signer.ts       # WalletSession → TransactionSigner
│   │   │   └── context.tsx     # WalletProvider + useWallet() hook
│   │   ├── hooks/
│   │   │   ├── use-balance.ts  # SWR-based balance fetching
│   │   │   └── use-send-transaction.ts  # Transaction send with loading state
│   │   ├── cluster.ts          # Cluster endpoints + RPC factory
│   │   ├── lamports.ts         # SOL/lamports conversion
│   │   ├── send-transaction.ts # Transaction build + sign + send pipeline
│   │   ├── errors.ts           # Transaction error parsing
│   │   └── explorer.ts         # Explorer URL builder + address helpers
│   └── page.tsx                # Main page
├── anchor/                     # Anchor workspace
│   └── programs/vault/         # Vault program (Rust)
└── codama.json                 # Codama client generation config
```

## Local Development

To test against a local validator instead of devnet:

1. **Start a local validator**

   ```bash
   solana-test-validator
   ```

2. **Deploy the program locally**

   ```bash
   solana config set --url localhost
   cd anchor
   anchor build
   anchor deploy
   cd ..
   npm run codama:js   # Regenerate client with local program ID
   ```

3. **Switch to localnet** in the app using the cluster selector in the header.

## Deploy Your Own Vault

The repo points at devnet program `AhG1mX9GuvsiZSvoHE4yjro92xbP5Rswx87NnusoQPrf`. The **source in this checkout** expects that address to run the matching binary (multiple deposits, `withdraw_partial`, `send_to`). If you pulled a newer codebase but still hit **`VaultAlreadyExists`** on deposit or unrecognized instructions when withdrawing partially, Devnet still has an **older deployed build** until you redeploy yourself (below). To use your **own** program ID: `anchor keys sync`, rebuild, deploy, run `npm run setup`.

Previously the template advertised a shared devnet build; upgrading that canonical deployment is independent of local development. Treat **your deployed program** as the source of truth.

To deploy **your own** vault:

### Prerequisites

- [Rust](https://rustup.rs/)
- [Solana CLI](https://solana.com/docs/intro/installation)
- [Anchor](https://www.anchor-lang.com/docs/installation)

### Steps

1. **Configure Solana CLI for devnet**

   ```bash
   solana config set --url devnet
   ```

2. **Create a wallet (if needed) and fund it**

   ```bash
   solana-keygen new
   solana airdrop 2
   ```

3. **Build and deploy the program**

   ```bash
   cd anchor
   anchor build
   anchor keys sync    # Updates program ID in source
   anchor build        # Rebuild with new ID
   anchor deploy
   cd ..
   ```

4. **Regenerate the client and restart**
   ```bash
   npm run setup   # Rebuilds program and regenerates client
   npm run dev
   ```

## Testing

Tests use [LiteSVM](https://github.com/LiteSVM/litesvm), a fast lightweight Solana VM for testing.

```bash
npm run anchor-build   # Build the program first
npm run anchor-test    # Run tests
```

The tests are in `anchor/programs/vault/src/tests.rs` and automatically use the program ID from `declare_id!`.

## Regenerating the Client

If you modify the program, regenerate the TypeScript client:

```bash
npm run setup   # Or: npm run anchor-build && npm run codama:js
```

This uses [Codama](https://github.com/codama-idl/codama) to generate a type-safe client from the Anchor IDL.

## Learn More

- [Solana Docs](https://solana.com/docs) — core concepts and guides
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction) — program development framework
- [Deploying Programs](https://solana.com/docs/programs/deploying) — deployment guide
- [@solana/kit](https://github.com/anza-xyz/kit) — Solana JavaScript SDK
- [Codama](https://github.com/codama-idl/codama) — client generation from IDL

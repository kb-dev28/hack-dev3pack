import { createEmptyClient } from "@solana/kit";
import { rpc, rpcAirdrop } from "@solana/kit-plugin-rpc";

export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

/**
 * CAIP-2 chain ids for Wallet Standard (truncate(getGenesisHash(), 32)).
 * Wallets like Phantom reject `solana:devnet` — they need the genesis-based id.
 * @see https://namespaces.chainagnostic.org/solana/caip2
 */
export const WALLET_STANDARD_CHAINS: Record<ClusterMoniker, string> = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
  /** Default `solana-test-validator` genesis (varies by Agave version). */
  localnet: "solana:4754oPEMhAKy14CZc8GzQUP93CB4ouEL",
};

export function getWalletStandardChain(cluster: ClusterMoniker): string {
  if (cluster === "localnet" && typeof process !== "undefined") {
    const fromEnv = process.env.NEXT_PUBLIC_LOCALNET_WALLET_CHAIN;
    if (fromEnv) return fromEnv;
  }
  return WALLET_STANDARD_CHAINS[cluster];
}

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const CLUSTER_URLS: Record<ClusterMoniker, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

const WS_URLS: Record<ClusterMoniker, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

export function getClusterUrl(cluster: ClusterMoniker) {
  return CLUSTER_URLS[cluster];
}

export function getClusterWsConfig(cluster: ClusterMoniker) {
  return cluster === "localnet" ? { url: WS_URLS[cluster] } : undefined;
}

export function createSolanaClient(cluster: ClusterMoniker) {
  const url = CLUSTER_URLS[cluster];
  const wsUrl = WS_URLS[cluster];
  return createEmptyClient()
    .use(rpc(url, { url: wsUrl }))
    .use(rpcAirdrop());
}

export type SolanaClient = ReturnType<typeof createSolanaClient>;

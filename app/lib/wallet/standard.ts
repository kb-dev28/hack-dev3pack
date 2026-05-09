import { getWallets } from "@wallet-standard/app";
import type {
  Wallet as StandardWallet,
  WalletAccount,
} from "@wallet-standard/base";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";
import {
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  type SolanaSignTransactionFeature,
  type SolanaSignAndSendTransactionFeature,
} from "@solana/wallet-standard-features";
import type { Address } from "@solana/kit";
import type {
  WalletConnector,
  WalletConnectorMetadata,
  WalletSession,
} from "./types";

export function isSolanaWallet(wallet: StandardWallet): boolean {
  return (
    StandardConnect in wallet.features &&
    wallet.chains.some((chain) => chain.startsWith("solana:"))
  );
}

function connectorMetadata(wallet: StandardWallet): WalletConnectorMetadata {
  return {
    id: wallet.name,
    name: wallet.name,
    icon: wallet.icon,
  };
}

/**
 * Builds a fresh session tied to `account` — must come from wallet-authorised
 * `WalletAccount` instances (Phantom requires the same refs for signing).
 */
export function createSolanaWalletSession(
  wallet: StandardWallet,
  account: WalletAccount
): WalletSession {
  const metadata = connectorMetadata(wallet);
  const hasSendTx = SolanaSignAndSendTransaction in wallet.features;
  const hasSignTx = SolanaSignTransaction in wallet.features;

  const walletAccount = {
    address: account.address as Address,
    publicKey: new Uint8Array(account.publicKey),
    label: account.label,
  };

  return {
    account: walletAccount,
    connector: metadata,
    disconnect: async () => {
      if (StandardDisconnect in wallet.features) {
        const feature = wallet.features[
          StandardDisconnect
        ] as StandardDisconnectFeature[typeof StandardDisconnect];
        await feature.disconnect();
      }
    },
    signTransaction: hasSignTx
      ? async (transaction: Uint8Array, chain: string) => {
          const feature = wallet.features[
            SolanaSignTransaction
          ] as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
          const [result] = await feature.signTransaction({
            account,
            transaction,
            chain: chain as `${string}:${string}`,
          });
          return new Uint8Array(result.signedTransaction);
        }
      : undefined,
    sendTransaction: hasSendTx
      ? async (transaction: Uint8Array, chain: string) => {
          const feature = wallet.features[
            SolanaSignAndSendTransaction
          ] as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
          const [result] = await feature.signAndSendTransaction({
            account,
            transaction,
            chain: chain as `${string}:${string}`,
          });
          return new Uint8Array(result.signature);
        }
      : undefined,
  };
}

/** Listen for Phantom / wallet account switches (`standard:events` → `change`). */
export function subscribeStandardWalletAccountsChanged(
  wallet: StandardWallet,
  onChange: (accounts: readonly WalletAccount[]) => void
): () => void {
  if (!(StandardEvents in wallet.features)) {
    return () => {};
  }
  const events = wallet.features[
    StandardEvents
  ] as StandardEventsFeature[typeof StandardEvents];
  return events.on("change", (properties) => {
    if (properties.accounts !== undefined && properties.accounts.length > 0) {
      onChange(properties.accounts);
    }
  });
}

/** Resolve the injected wallet backing the connected session by connector name match. */
export function findRegisteredSolanaWallet(
  connectorId: string
): StandardWallet | undefined {
  return getWallets()
    .get()
    .find((w) => isSolanaWallet(w) && w.name === connectorId);
}

function createConnector(wallet: StandardWallet): WalletConnector {
  const metadata = connectorMetadata(wallet);

  return {
    ...metadata,
    connect: async (options) => {
      const connectFeature = wallet.features[
        StandardConnect
      ] as StandardConnectFeature[typeof StandardConnect];
      const { accounts } = await connectFeature.connect(
        options?.silent ? { silent: true } : undefined
      );

      const account = accounts[0] ?? wallet.accounts[0];
      if (!account) throw new Error("No accounts available");

      return createSolanaWalletSession(wallet, account);
    },
  };
}

export function discoverWallets(): WalletConnector[] {
  const { get } = getWallets();
  return get().filter(isSolanaWallet).map(createConnector);
}

export function watchWallets(
  onChange: (connectors: WalletConnector[]) => void
): () => void {
  const wallets = getWallets();

  function update() {
    onChange(wallets.get().filter(isSolanaWallet).map(createConnector));
  }

  const offRegister = wallets.on("register", update);
  const offUnregister = wallets.on("unregister", update);

  return () => {
    offRegister();
    offUnregister();
  };
}

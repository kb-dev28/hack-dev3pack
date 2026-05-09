import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import {
  getVaultErrorMessage,
  VAULT_ERROR__INSUFFICIENT_VAULT_BALANCE,
  VAULT_ERROR__INVALID_AMOUNT,
  VAULT_ERROR__INVALID_RECIPIENT,
  VAULT_ERROR__VAULT_BELOW_RENT_MINIMUM,
  type VaultError,
} from "../generated/vault";

const DEPLOY_HINT =
  "Deploy this project's program to Devnet so it matches the UI: cd anchor && anchor build && anchor deploy (or anchor keys sync for a fresh program ID), then npm run setup from repo root";

const OUTDATED_VAULT_HINT = `Vault program on-chain is outdated. The public template deployment only allows one deposit (VaultAlreadyExists on the second deposit). ${DEPLOY_HINT}.`;

const MISSING_IX_HINT = `This instruction is not implemented by the vault program deployed at your cluster. Common cause: RPC still serves an older vault binary without withdraw_partial/send_to. ${DEPLOY_HINT}.`;

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v
    );
  } catch {
    return "";
  }
}

/** Collect nested messages + JSON blobs so simulation logs (“Program log: VaultAlready…” ) are visible. */
function errorHaystack(err: unknown): string {
  const parts: string[] = [];
  const visit = (e: unknown) => {
    if (typeof e === "string") parts.push(e);
    else parts.push(String(e));
    parts.push(safeJsonStringify(e));

    let cur = e instanceof Error ? e : null;
    for (let d = 0; d < 10 && cur; d++) {
      parts.push(cur.message);
      parts.push(cur.stack ?? "");
      const next = cur.cause;
      cur = typeof next !== "undefined" && next instanceof Error ? next : null;
    }
    return undefined;
  };
  visit(err);
  return parts.join("\n").slice(0, 32000);
}

const VAULT_ERROR_CODES: Record<number, VaultError> = {
  [VAULT_ERROR__INVALID_AMOUNT]: VAULT_ERROR__INVALID_AMOUNT,
  [VAULT_ERROR__VAULT_BELOW_RENT_MINIMUM]:
    VAULT_ERROR__VAULT_BELOW_RENT_MINIMUM,
  [VAULT_ERROR__INSUFFICIENT_VAULT_BALANCE]:
    VAULT_ERROR__INSUFFICIENT_VAULT_BALANCE,
  [VAULT_ERROR__INVALID_RECIPIENT]: VAULT_ERROR__INVALID_RECIPIENT,
};

/** Custom error #6000: old Anchor enum used VaultAlreadyExists first; new enum uses InvalidAmount first — infer from simulation text. */
function explainLegacy6000(stack: string, code: number): string | null {
  if (code !== 6000 && code !== 0x1770) return null;
  if (stack.includes("VaultAlreadyExists")) return OUTDATED_VAULT_HINT;
  return null;
}

export function parseTransactionError(err: unknown): string {
  const stackBlob = errorHaystack(err);

  const bubble = getDeepestMessage(err);
  if (bubble === "Unexpected error" || bubble.includes("Unexpected error")) {
    return `Wallet reported a generic signing error. Confirm Phantom is on the same cluster as the app (e.g. Devnet) and try again. If it persists, disconnect the wallet and reconnect. Technical: apps must pass Wallet Standard chain ids like ${"solana:EtWTR…"} for devnet, not solana:devnet.`;
  }

  if (stackBlob.includes("VaultAlreadyExists")) return OUTDATED_VAULT_HINT;

  if (
    stackBlob.includes("InstructionFallbackNotFound") ||
    stackBlob.includes("InstructionDidNotDeserialize") ||
    stackBlob.includes("invalid instruction discriminator")
  ) {
    return MISSING_IX_HINT;
  }

  // Wallet rejection (wallet-standard, not a SolanaError)
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const legacy = explainLegacy6000(stackBlob, err.context.code);
    if (legacy) return legacy;

    const vaultError = VAULT_ERROR_CODES[err.context.code];
    if (vaultError !== undefined) {
      return getVaultErrorMessage(vaultError);
    }
  }

  const message = getDeepestMessage(err);
  return message.length > 280 ? `${message.slice(0, 280)}…` : message;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}

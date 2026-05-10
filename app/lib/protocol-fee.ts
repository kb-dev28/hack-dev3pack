import { address, type Address } from "@solana/kit";

/**
 * Protocol fee on Smart Send (vault → recipient), in parts per million of
 * gross lamports leaving the vault. 10 ppm = 0.001% (symbolic; keeps yield
 * story intact).
 */
export const PROTOCOL_SEND_FEE_PPM = 10;

export function protocolFeeLamports(grossLamports: bigint): bigint {
  if (grossLamports <= 0n) return 0n;
  return (grossLamports * BigInt(PROTOCOL_SEND_FEE_PPM)) / 1_000_000n;
}

/** Human label matching {@link PROTOCOL_SEND_FEE_PPM} (10 → "0.001%"). */
export function protocolSendFeePercentLabel(): string {
  return `${PROTOCOL_SEND_FEE_PPM / 10_000}%`;
}

/**
 * Optional Solana address (same cluster as the app) that receives the fee.
 * If unset or invalid, Smart Send sends the full gross amount to the recipient
 * only (no fee instruction).
 */
export function getProtocolTreasuryAddress(): Address | null {
  const raw = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY?.trim();
  if (!raw) return null;
  try {
    return address(raw);
  } catch {
    return null;
  }
}

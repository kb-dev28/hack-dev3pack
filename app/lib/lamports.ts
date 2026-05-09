import { lamports, type Lamports } from "@solana/kit";

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function lamportsFromSol(sol: number): Lamports {
  return lamports(BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL))));
}

/** Floors lamports so USD→SOL conversions never round up past vault balance. */
export function lamportsFromSolFloor(sol: number): Lamports {
  if (!Number.isFinite(sol) || sol <= 0) return lamports(0n);
  const raw = sol * Number(LAMPORTS_PER_SOL);
  return lamports(BigInt(Math.floor(Math.max(0, raw))));
}

export function lamportsToSolString(amount: Lamports, maxDecimals = 2): string {
  const whole = amount / LAMPORTS_PER_SOL;
  const fractional = amount % LAMPORTS_PER_SOL;

  if (fractional === 0n) return whole.toString();

  const decimals = fractional.toString().padStart(9, "0").slice(0, maxDecimals);

  if (decimals.replace(/0+$/, "") === "") return whole.toString();

  return `${whole}.${decimals.replace(/0+$/, "")}`;
}

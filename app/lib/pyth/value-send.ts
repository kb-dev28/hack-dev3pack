/**
 * USD notional → SOL using Pyth spot SOL/USD (USD per 1 SOL).
 * Pure UI / instruction-sizing helper; vault still moves native SOL lamports.
 */
export function usdToSol(usd: number, solUsd: number): number {
  if (
    !Number.isFinite(usd) ||
    usd <= 0 ||
    !Number.isFinite(solUsd) ||
    solUsd <= 0
  ) {
    return NaN;
  }
  return usd / solUsd;
}

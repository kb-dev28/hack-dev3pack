import { HermesClient } from "@pythnetwork/hermes-client";
import {
  PYTH_FEED_BTC_USD,
  PYTH_FEED_JITOSOL_USD,
  PYTH_FEED_SOL_USD,
  PYTH_FEED_XLM_USD,
  PYTH_HERMES_ENDPOINT,
} from "./constants";

export type JitosolSolQuote = {
  /** Spot USD/SOL implied by aggregated price. */
  solUsd: number;
  /** Spot USD/JITOSOL. */
  jitosolUsd: number;
  /** JITOSOL per 1 SOL (USD ratio). Vault lamports × this ÷ LAMPORTS_PER_SOL visual “JitoSOL”. */
  jitosolPerSol: number;
  /** USD per 1 BTC (for cross-asset send UI). */
  btcUsd: number;
  /** USD per 1 XLM. */
  xlmUsd: number;
  /** Oldest publish_time among the feeds used (seconds). */
  publishTimeEarliestSec: number;
};

function normalizeFeedId(hex: string): string {
  return hex.replace(/^0x/i, "").toLowerCase();
}

function rawPriceToNumber(priceStr: string, expo: number): number {
  const m = Number(BigInt(priceStr));
  return m * 10 ** expo;
}

export async function fetchJitosolSolQuote(): Promise<JitosolSolQuote> {
  const client = new HermesClient(PYTH_HERMES_ENDPOINT);
  const ids = [
    normalizeFeedId(PYTH_FEED_SOL_USD),
    normalizeFeedId(PYTH_FEED_JITOSOL_USD),
    normalizeFeedId(PYTH_FEED_BTC_USD),
    normalizeFeedId(PYTH_FEED_XLM_USD),
  ];
  const res = await client.getLatestPriceUpdates(ids, { parsed: true });

  const parsed = res.parsed;
  if (!parsed?.length) {
    throw new Error("Hermes returned no parsed prices.");
  }

  const wantSol = normalizeFeedId(PYTH_FEED_SOL_USD);
  const wantJit = normalizeFeedId(PYTH_FEED_JITOSOL_USD);
  const wantBtc = normalizeFeedId(PYTH_FEED_BTC_USD);
  const wantXlm = normalizeFeedId(PYTH_FEED_XLM_USD);

  const rowSol = parsed.find((p) => normalizeFeedId(p.id) === wantSol);
  const rowJit = parsed.find((p) => normalizeFeedId(p.id) === wantJit);
  const rowBtc = parsed.find((p) => normalizeFeedId(p.id) === wantBtc);
  const rowXlm = parsed.find((p) => normalizeFeedId(p.id) === wantXlm);

  if (!rowSol?.price || !rowJit?.price || !rowBtc?.price || !rowXlm?.price) {
    throw new Error(
      "Missing SOL/USD, JITOSOL/USD, BTC/USD or XLM/USD in Hermes response."
    );
  }

  const solUsd = rawPriceToNumber(rowSol.price.price, rowSol.price.expo);
  const jitosolUsd = rawPriceToNumber(rowJit.price.price, rowJit.price.expo);
  const btcUsd = rawPriceToNumber(rowBtc.price.price, rowBtc.price.expo);
  const xlmUsd = rawPriceToNumber(rowXlm.price.price, rowXlm.price.expo);

  if (solUsd <= 0 || jitosolUsd <= 0 || btcUsd <= 0 || xlmUsd <= 0) {
    throw new Error("Non-positive Pyth price.");
  }

  const jitosolPerSol = solUsd / jitosolUsd;
  const publishTimeEarliestSec = Math.min(
    rowSol.price.publish_time,
    rowJit.price.publish_time,
    rowBtc.price.publish_time,
    rowXlm.price.publish_time
  );

  return {
    solUsd,
    jitosolUsd,
    jitosolPerSol,
    btcUsd,
    xlmUsd,
    publishTimeEarliestSec,
  };
}

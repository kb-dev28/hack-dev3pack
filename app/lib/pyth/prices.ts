import { HermesClient } from "@pythnetwork/hermes-client";
import {
  PYTH_FEED_BTC_USD,
  PYTH_FEED_ETH_USD,
  PYTH_FEED_EUR_USD,
  PYTH_FEED_JITOSOL_USD,
  PYTH_FEED_SOL_USD,
  PYTH_FEED_USD_MXN,
  PYTH_FEED_USDT_USD,
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
  /** USD per 1 ETH. */
  ethUsd: number;
  /** USD per 1 EUR (FX.EUR/USD). */
  eurUsd: number;
  /**
   * MXN per 1 USD (FX.USD/MXN). Convert MXN→USD as: `usd = mxn / usdMxn`.
   */
  usdMxn: number;
  /** ~USD per 1 USDT (stable; ~1). */
  usdtUsd: number;
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
    normalizeFeedId(PYTH_FEED_ETH_USD),
    normalizeFeedId(PYTH_FEED_EUR_USD),
    normalizeFeedId(PYTH_FEED_USD_MXN),
    normalizeFeedId(PYTH_FEED_USDT_USD),
  ];
  const res = await client.getLatestPriceUpdates(ids, { parsed: true });

  const parsed = res.parsed;
  if (!parsed?.length) {
    throw new Error("Hermes returned no parsed prices.");
  }

  const pick = (want: string) =>
    parsed.find((p) => normalizeFeedId(p.id) === normalizeFeedId(want));

  const rowSol = pick(PYTH_FEED_SOL_USD);
  const rowJit = pick(PYTH_FEED_JITOSOL_USD);
  const rowBtc = pick(PYTH_FEED_BTC_USD);
  const rowXlm = pick(PYTH_FEED_XLM_USD);
  const rowEth = pick(PYTH_FEED_ETH_USD);
  const rowEur = pick(PYTH_FEED_EUR_USD);
  const rowMxn = pick(PYTH_FEED_USD_MXN);
  const rowUsdt = pick(PYTH_FEED_USDT_USD);

  if (
    !rowSol?.price ||
    !rowJit?.price ||
    !rowBtc?.price ||
    !rowXlm?.price ||
    !rowEth?.price ||
    !rowEur?.price ||
    !rowMxn?.price ||
    !rowUsdt?.price
  ) {
    throw new Error(
      "Missing one of SOL/JITOSOL/BTC/XLM/ETH/EUR-USD, USD/MXN, or USDT/USD from Hermes.",
    );
  }

  const solUsd = rawPriceToNumber(rowSol.price.price, rowSol.price.expo);
  const jitosolUsd = rawPriceToNumber(rowJit.price.price, rowJit.price.expo);
  const btcUsd = rawPriceToNumber(rowBtc.price.price, rowBtc.price.expo);
  const xlmUsd = rawPriceToNumber(rowXlm.price.price, rowXlm.price.expo);
  const ethUsd = rawPriceToNumber(rowEth.price.price, rowEth.price.expo);
  const eurUsd = rawPriceToNumber(rowEur.price.price, rowEur.price.expo);
  const usdMxn = rawPriceToNumber(rowMxn.price.price, rowMxn.price.expo);
  const usdtUsd = rawPriceToNumber(rowUsdt.price.price, rowUsdt.price.expo);

  if (
    solUsd <= 0 ||
    jitosolUsd <= 0 ||
    btcUsd <= 0 ||
    xlmUsd <= 0 ||
    ethUsd <= 0 ||
    eurUsd <= 0 ||
    usdMxn <= 0 ||
    usdtUsd <= 0
  ) {
    throw new Error("Non-positive Pyth price.");
  }

  const jitosolPerSol = solUsd / jitosolUsd;
  const publishTimeEarliestSec = Math.min(
    rowSol.price.publish_time,
    rowJit.price.publish_time,
    rowBtc.price.publish_time,
    rowXlm.price.publish_time,
    rowEth.price.publish_time,
    rowEur.price.publish_time,
    rowMxn.price.publish_time,
    rowUsdt.price.publish_time,
  );

  return {
    solUsd,
    jitosolUsd,
    jitosolPerSol,
    btcUsd,
    xlmUsd,
    ethUsd,
    eurUsd,
    usdMxn,
    usdtUsd,
    publishTimeEarliestSec,
  };
}

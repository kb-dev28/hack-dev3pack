/** Hermes base URL — mainnet aggregator prices pulled from REST (OK for Devnet demos). */
export const PYTH_HERMES_ENDPOINT =
  process.env.NEXT_PUBLIC_PYTH_HERMES_URL ?? "https://hermes.pyth.network";

/**
 * SOL/USD and JITOSOL/USD canonical feed IDs from Hermes `price_feeds` (Crypto.*).
 */
export const PYTH_FEED_SOL_USD =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

export const PYTH_FEED_JITOSOL_USD =
  "67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb";

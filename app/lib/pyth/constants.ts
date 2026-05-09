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

/** BTC/USD · Hermes Crypto.BTC/USD — used for conversational send sizing (UI). */
export const PYTH_FEED_BTC_USD =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

/** XLM/USD · Hermes Crypto.XLM/USD */
export const PYTH_FEED_XLM_USD =
  "b7a8eba68a997cd0210c2e1e4ee811ad2d174b3611c22d9ebf16f4cb7e9ba850";

/** ETH/USD · Hermes Crypto.ETH/USD */
export const PYTH_FEED_ETH_USD =
  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

/** EUR/USD · Hermes FX.EUR/USD (USD per 1 EUR) */
export const PYTH_FEED_EUR_USD =
  "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b";

/**
 * USD/MXN · Hermes FX.USD/MXN — **MXN per 1 USD** (divide MXN amounts by this for USD).
 */
export const PYTH_FEED_USD_MXN =
  "e13b1c1ffb32f34e1be9545583f01ef385fde7f42ee66049d30570dc866b77ca";

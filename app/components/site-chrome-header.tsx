"use client";

import { HelpCircle } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";
import { usePythJitosolQuote } from "../lib/hooks/use-pyth-jitosol-quote";

function formatJitosolLike(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function SiteChromeHeader() {
  const pythQuote = usePythJitosolQuote();

  return (
    <header className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6 sm:py-3">
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 shrink">
          <h1 className="text-3xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-4xl">
            EverYield
          </h1>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-snug sm:text-base">
            <span className="font-medium text-emerald-600 dark:text-emerald-400/95">
              Your SOL never sleeps. Pay in any value, settled instantly from
              yield.
            </span>
            <span className="text-[11px] font-normal text-muted-foreground sm:text-xs">
              Live Pyth Hermes prices.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
          <button
            type="button"
            className="group relative shrink-0 rounded-full p-1 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            aria-label="Product and technical details"
          >
            <HelpCircle
              className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]"
              strokeWidth={1.75}
            />
            <span
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-popover px-3.5 py-3.5 text-left text-popover-foreground shadow-xl opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
            >
              <div className="space-y-2 border-b border-border pb-2.5 text-[11px] leading-snug text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">Strategy:</span>{" "}
                  Assets are optimized in JitoSOL for real-time value accrual.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Oracle:</span>{" "}
                  Prices synced via Pyth Network Hermes (Mainnet).
                </p>
                <p>
                  <span className="font-semibold text-foreground">Safety:</span>{" "}
                  Funds are held in a non-custodial PDA Vault (Devnet).
                </p>
                <p>
                  <span className="font-semibold text-foreground">
                    Transparency:
                  </span>{" "}
                  The displayed SOL balance grows as the JitoSOL/SOL ratio
                  increases.
                </p>
              </div>
              <div className="mt-2.5 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground/80">
                    Balance and display
                  </span>
                  <br />
                  Position held in JitoSOL — main number is SOL for readability.
                  On-chain balance is native SOL lamports in the vault PDA.
                </p>
                {pythQuote.data && (
                  <p className="font-mono text-[10px]">
                    <span className="font-sans font-semibold text-foreground/80">
                      Pyth spot ratio:
                    </span>{" "}
                    {formatJitosolLike(pythQuote.data.jitosolPerSol)} JitoSOL / 1
                    SOL
                  </p>
                )}
              </div>
            </span>
          </button>
          <ThemeToggle />
          <ClusterSelect />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

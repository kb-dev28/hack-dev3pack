"use client";

import { useEffect, useRef, useState } from "react";

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

/** Annual rate for UI-only “staking” demo (not on-chain). */
export const YIELDLINK_SIMULATED_APR = 0.07;

function t0StorageKey(vaultPda: string): string {
  return `yieldlink_mvp_yield_t0_${vaultPda}`;
}

export type SimulatedJitoYield = {
  principalJito: number;
  yieldJito: number;
  totalJito: number;
  yieldUsd: number;
  elapsedSec: number;
  apr: number;
  /** On-chain principal as SOL. */
  principalSol: number;
  /** Simulated yield expressed as SOL (JitoSOL yield ÷ spot ratio). */
  yieldSol: number;
  /** principalSol + yieldSol — UX “dynamic” balance. */
  dynamicSol: number;
};

/**
 * Monotonic “accrued yield” in JitoSOL-equivalent units from a fixed start time
 * while the vault holds funds. Resets when the vault drains to zero (sessionStorage).
 */
export function useSimulatedJitoYield({
  vaultPda,
  vaultLamports,
  jitosolPerSol,
  jitosolUsd,
  apr = YIELDLINK_SIMULATED_APR,
  hasPyth,
}: {
  vaultPda: string | null | undefined;
  vaultLamports: bigint | undefined | null;
  jitosolPerSol: number | undefined;
  jitosolUsd: number | undefined;
  apr?: number;
  hasPyth: boolean;
}): SimulatedJitoYield | null {
  const [yieldState, setYieldState] = useState<SimulatedJitoYield | null>(null);

  /** Accrual start (ms); only used inside the effect + interval. */
  const accrualStartMsRef = useRef<number | null>(null);

  const lamports = vaultLamports ?? 0n;
  const hasFunds = lamports > 0n;

  useEffect(() => {
    function clearYieldSoon(): void {
      queueMicrotask(() => setYieldState(null));
    }

    function resetStorageForVault(): void {
      if (vaultPda) sessionStorage.removeItem(t0StorageKey(vaultPda));
      accrualStartMsRef.current = null;
    }

    function setup(): void | (() => void) {
      if (typeof window === "undefined") {
        clearYieldSoon();
        return;
      }

      if (!vaultPda) {
        accrualStartMsRef.current = null;
        clearYieldSoon();
        return;
      }

      if (!hasFunds) {
        resetStorageForVault();
        clearYieldSoon();
        return;
      }

      if (!hasPyth || jitosolPerSol == null || jitosolUsd == null) {
        clearYieldSoon();
        return;
      }

      if (
        !Number.isFinite(jitosolPerSol) ||
        jitosolPerSol <= 0 ||
        jitosolUsd <= 0
      ) {
        clearYieldSoon();
        return;
      }

      const key = t0StorageKey(vaultPda);
      let startMs =
        typeof sessionStorage.getItem(key) === "string"
          ? Number(sessionStorage.getItem(key))
          : NaN;

      if (!Number.isFinite(startMs)) {
        startMs = Date.now();
        sessionStorage.setItem(key, String(startMs));
      }

      accrualStartMsRef.current = startMs;

      function compute(nowMs: number): SimulatedJitoYield {
        const start = accrualStartMsRef.current;
        const solInVault = Number(lamports) / 1_000_000_000;
        const principalJito = solInVault * jitosolPerSol!;
        const elapsedSec =
          start != null ? Math.max(0, (nowMs - start) / 1000) : 0;

        const yieldJito = principalJito * apr * (elapsedSec / SECONDS_PER_YEAR);

        const totalJito = principalJito + yieldJito;
        const yieldUsd = yieldJito * jitosolUsd!;
        const yieldSol = yieldJito / jitosolPerSol!;
        const principalSol = solInVault;
        const dynamicSol = principalSol + yieldSol;

        return {
          principalJito,
          yieldJito,
          totalJito,
          yieldUsd,
          elapsedSec,
          apr,
          principalSol,
          yieldSol,
          dynamicSol,
        };
      }

      function tick(): void {
        setYieldState(compute(Date.now()));
      }

      tick();
      const id = setInterval(tick, 100);
      return () => clearInterval(id);
    }

    const cleanupOuter = setup();
    return typeof cleanupOuter === "function" ? cleanupOuter : undefined;
  }, [vaultPda, hasFunds, hasPyth, lamports, jitosolPerSol, jitosolUsd, apr]);

  return yieldState;
}

"use client";

import { useEffect, useRef, useState } from "react";

function storageKey(walletKey: string): string {
  return `yieldlink_lifetime_sol_earned_v1_${walletKey}`;
}

/**
 * Cumulative demo “SOL earned” (UI-only) for this wallet. Only increases when
 * session simulated yield (in SOL) grows; never decreases on partial withdraw.
 */
export function useLifetimeSolEarned(
  walletKey: string | null | undefined,
  sessionYieldSol: number | null,
  hasVaultFunds: boolean
): number {
  const [total, setTotal] = useState(0);
  const lastSessionYieldRef = useRef(0);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!walletKey || typeof window === "undefined") {
      hydratedRef.current = false;
      queueMicrotask(() => setTotal(0));
      return;
    }
    const raw = localStorage.getItem(storageKey(walletKey));
    const v = raw != null ? Number(raw) : 0;
    const next = Number.isFinite(v) && v >= 0 ? v : 0;
    queueMicrotask(() => setTotal(next));
    hydratedRef.current = true;
  }, [walletKey]);

  useEffect(() => {
    if (!walletKey || !hydratedRef.current) return;

    if (!hasVaultFunds) {
      lastSessionYieldRef.current = 0;
      return;
    }

    if (sessionYieldSol == null || !Number.isFinite(sessionYieldSol)) return;

    const last = lastSessionYieldRef.current;
    if (sessionYieldSol > last) {
      const delta = sessionYieldSol - last;
      if (delta > 0) {
        const raw = localStorage.getItem(storageKey(walletKey));
        const prev = raw != null ? Number(raw) : 0;
        const next = (Number.isFinite(prev) ? prev : 0) + delta;
        localStorage.setItem(storageKey(walletKey), String(next));
        setTotal(next);
      }
    }
    lastSessionYieldRef.current = sessionYieldSol;
  }, [walletKey, hasVaultFunds, sessionYieldSol]);

  return total;
}

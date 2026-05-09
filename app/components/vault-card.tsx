"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { animate, motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useBalance } from "../lib/hooks/use-balance";
import { usePythJitosolQuote } from "../lib/hooks/use-pyth-jitosol-quote";
import { useSimulatedJitoYield } from "../lib/hooks/use-simulated-jito-yield";
import { useLifetimeSolEarned } from "../lib/hooks/use-lifetime-sol-earned";
import { lamportsFromSol, lamportsToSolString } from "../lib/lamports";
import { address, type Address } from "@solana/kit";
import { toast } from "sonner";
import {
  getDepositInstruction,
  getWithdrawInstruction,
  getWithdrawInstructionAsync,
  getWithdrawPartialInstruction,
  getSendToInstruction,
} from "../generated/vault";
import { parseTransactionError } from "../lib/errors";
import { useCluster } from "./cluster-context";

const SOLANA_ACCENT = "#14F195";

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatJitosolLike(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.floor(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (sec < 3600) return `${m}m ${s}s`;
  const h = Math.floor(sec / 3600);
  const m2 = Math.floor((sec % 3600) / 60);
  return `${h}h ${m2}m`;
}

function splitFixed8(n: number): { intPart: string; fracA: string; fracB: string } {
  if (!Number.isFinite(n) || n < 0) {
    return { intPart: "0", fracA: "0000", fracB: "0000" };
  }
  const [i, f = ""] = n.toFixed(8).split(".");
  const pad = `${f}00000000`.slice(0, 8);
  return { intPart: i, fracA: pad.slice(0, 4), fracB: pad.slice(4, 8) };
}

function useAnimatedSol(target: number, active: boolean): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!active) {
      displayRef.current = target;
      queueMicrotask(() => setDisplay(target));
      return;
    }
    const from = displayRef.current;
    const anim = animate(from, target, {
      type: "spring",
      stiffness: 220,
      damping: 28,
      mass: 0.7,
      onUpdate: (latest: number) => {
        displayRef.current = latest;
        setDisplay(latest);
      },
    });
    return () => anim.stop();
  }, [target, active]);

  return display;
}

function PremiumShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-3xl bg-gradient-to-br from-[#14F195]/75 via-emerald-500/35 to-violet-600/80 p-px shadow-[0_24px_80px_-32px_rgba(20,241,149,0.35)]">
      <div className="rounded-3xl bg-neutral-950/55 backdrop-blur-md">{children}</div>
    </div>
  );
}

export function VaultCard() {
  const { wallet, signer, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();

  const pythQuote = usePythJitosolQuote();

  const [amount, setAmount] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null);

  const walletAddress = wallet?.account.address;
  const walletKey = walletAddress ? String(walletAddress) : null;

  useEffect(() => {
    let cancelled = false;

    async function deriveVault() {
      if (!signer) {
        setVaultAddress(null);
        return;
      }

      try {
        const ix = await getWithdrawInstructionAsync({ signer });
        const pda = ix.accounts[1]?.address;
        if (!cancelled) setVaultAddress((pda as Address) ?? null);
      } catch {
        if (!cancelled) setVaultAddress(null);
      }
    }

    void deriveVault();
    return () => {
      cancelled = true;
    };
  }, [signer]);

  const walletBalance = useBalance(walletAddress);
  const walletLamports = walletBalance?.lamports;
  const vaultBalance = useBalance(vaultAddress ?? undefined);
  const vaultLamports = vaultBalance?.lamports;

  const vl = vaultLamports ?? null;
  const hasVaultFunds = vl != null && vl > 0n;
  const solInVault = vl != null ? Number(vl) / 1_000_000_000 : 0;
  const jitosolEquiv =
    pythQuote.data && hasVaultFunds
      ? solInVault * pythQuote.data.jitosolPerSol
      : null;
  const usdEquiv =
    pythQuote.data && hasVaultFunds ? solInVault * pythQuote.data.solUsd : null;

  const simulated = useSimulatedJitoYield({
    vaultPda: vaultAddress ? String(vaultAddress) : null,
    vaultLamports: vaultLamports ?? null,
    jitosolPerSol: pythQuote.data?.jitosolPerSol,
    jitosolUsd: pythQuote.data?.jitosolUsd,
    hasPyth: Boolean(pythQuote.data),
  });

  const dynamicSolTarget =
    simulated != null
      ? simulated.dynamicSol
      : hasVaultFunds
        ? solInVault
        : 0;

  const animatedSol = useAnimatedSol(dynamicSolTarget, Boolean(simulated));

  const sessionYieldSol = simulated?.yieldSol ?? null;

  const lifetimeEarnedSol = useLifetimeSolEarned(
    walletKey,
    sessionYieldSol,
    hasVaultFunds,
  );

  const heroJito =
    simulated != null ? simulated.totalJito : (jitosolEquiv ?? null);

  const parts = splitFixed8(animatedSol);

  const handleDeposit = useCallback(async () => {
    if (!walletAddress || !vaultAddress || !amount || !signer) return;

    const depositLamports = lamportsFromSol(parseFloat(amount));
    if (walletLamports != null && walletLamports < depositLamports) {
      toast.error("Insufficient balance.", {
        description: `You need at least ${amount} SOL plus fees. Current balance: ${lamportsToSolString(walletLamports)} SOL.`,
      });
      return;
    }

    try {
      const instruction = getDepositInstruction({
        signer,
        vault: vaultAddress,
        amount: lamportsFromSol(parseFloat(amount)),
      });

      const signature = await send({ instructions: [instruction] });

      toast.success("Deposit confirmed!", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      setAmount("");
    } catch (err) {
      console.error("Deposit failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [
    walletAddress,
    vaultAddress,
    amount,
    signer,
    send,
    getExplorerUrl,
    walletLamports,
  ]);

  const handleWithdraw = useCallback(async () => {
    if (!walletAddress || !vaultAddress || !signer) return;

    try {
      const instruction = getWithdrawInstruction({
        signer,
        vault: vaultAddress,
      });

      const signature = await send({ instructions: [instruction] });

      toast.success("Withdrawal confirmed!", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
    } catch (err) {
      console.error("Withdraw failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [walletAddress, vaultAddress, signer, send, getExplorerUrl]);

  const handleWithdrawPartial = useCallback(async () => {
    if (!walletAddress || !vaultAddress || !signer || !partialAmount) return;
    const sol = parseFloat(partialAmount);
    if (!Number.isFinite(sol) || sol <= 0) {
      toast.error("Enter a valid partial amount in SOL.");
      return;
    }

    try {
      const instruction = getWithdrawPartialInstruction({
        signer,
        vault: vaultAddress,
        amount: lamportsFromSol(sol),
      });
      const signature = await send({ instructions: [instruction] });
      toast.success("Partial withdrawal confirmed!", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      setPartialAmount("");
    } catch (err) {
      console.error("Partial withdraw failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [
    walletAddress,
    vaultAddress,
    signer,
    partialAmount,
    send,
    getExplorerUrl,
  ]);

  const handleSendTo = useCallback(async () => {
    if (!walletAddress || !vaultAddress || !signer || !sendAmount) return;
    const sol = parseFloat(sendAmount);
    if (!Number.isFinite(sol) || sol <= 0) {
      toast.error("Enter a valid send amount in SOL.");
      return;
    }

    let recipientAddr: Address;
    try {
      recipientAddr = address(sendRecipient.trim());
    } catch {
      toast.error("Invalid recipient address.");
      return;
    }

    try {
      const instruction = getSendToInstruction({
        signer,
        vault: vaultAddress,
        recipient: recipientAddr,
        amount: lamportsFromSol(sol),
      });
      const signature = await send({ instructions: [instruction] });
      toast.success("Sent from vault!", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      setSendAmount("");
    } catch (err) {
      console.error("send_to failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [
    walletAddress,
    vaultAddress,
    signer,
    sendRecipient,
    sendAmount,
    send,
    getExplorerUrl,
  ]);

  if (status !== "connected") {
    return (
      <PremiumShell>
        <section className="w-full space-y-4 p-6 sm:p-8">
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-zinc-100">
              Your YieldLink Balance
            </p>
            <p className="text-sm text-zinc-400">
              Connect your wallet to open the vault.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-zinc-400">
            Wallet not connected
          </div>
        </section>
      </PremiumShell>
    );
  }

  return (
    <PremiumShell>
      <section className="w-full space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
              Your YieldLink Balance
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-zinc-400">
              On-chain balance is SOL lamports. “Dynamic SOL” adds a UI-only demo
              yield (Pyth ratios + time). Not liquid stake or transferable JitoSOL.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              (vaultLamports ?? 0n) > 0n
                ? "border border-[#14F195]/40 bg-[#14F195]/10 text-[#14F195]"
                : "border border-white/10 bg-white/5 text-zinc-400"
            }`}
          >
            {(vaultLamports ?? 0n) > 0n ? "Active" : "Empty"}
          </span>
        </div>

        {/* Hero — Dynamic SOL Value */}
        <div className="space-y-4">
          <div className="text-center sm:text-left">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Dynamic SOL Value
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-medium text-zinc-400">Staked Value</span>{" "}
              <span className="text-zinc-600">·</span>{" "}
              {heroJito != null ? (
                <>
                  ~
                  <span className="tabular-nums text-zinc-300">
                    {formatJitosolLike(heroJito)}
                  </span>{" "}
                  JitoSOL ·{" "}
                  <span className="tabular-nums">
                    {usdEquiv != null ? formatUsd(usdEquiv) : "—"}
                  </span>
                </>
              ) : hasVaultFunds && !pythQuote.data ? (
                <span>Loading Pyth for ratio…</span>
              ) : (
                <span>—</span>
              )}
            </p>

            <motion.div
              className="mt-4 font-mono tabular-nums text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl md:text-5xl"
              layout
            >
              <span className="select-none">{parts.intPart}</span>
              <span className="text-zinc-500">.</span>
              <span className="text-zinc-200">{parts.fracA}</span>
              <motion.span
                className="inline-block min-w-[4.5ch] text-emerald-200/95"
                key={parts.fracB}
                initial={{ y: 4, opacity: 0.35 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              >
                {parts.fracB}
              </motion.span>{" "}
              <span className="text-xl font-medium text-zinc-500 sm:text-2xl">
                SOL
              </span>
            </motion.div>

            <p className="mt-2 text-xs text-zinc-500">
              Principal{" "}
              <span className="font-mono text-zinc-400">
                {vaultLamports
                  ? lamportsToSolString(vaultLamports)
                  : "0.00000000"}{" "}
                SOL
              </span>
              {simulated && (
                <>
                  {" "}
                  + yield{" "}
                  <span
                    className="font-mono"
                    style={{ color: SOLANA_ACCENT }}
                  >
                    +{simulated.yieldSol.toFixed(8)}
                  </span>{" "}
                  SOL (simulated)
                </>
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <motion.div
              layout
              className="rounded-2xl border border-[#14F195]/25 bg-black/30 p-4 shadow-inner shadow-black/40"
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <Zap className="h-4 w-4" style={{ color: SOLANA_ACCENT }} />
                Real-time Profit
              </div>
              <p
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: SOLANA_ACCENT }}
              >
                +
                {(simulated?.yieldSol ?? 0).toFixed(8)}{" "}
                <span className="text-base font-medium text-zinc-400">SOL</span>
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Time generating yield:{" "}
                <span className="font-mono text-zinc-300">
                  {simulated
                    ? formatDurationSec(simulated.elapsedSec)
                    : hasVaultFunds
                      ? "—"
                      : "0s"}
                </span>
              </p>
            </motion.div>

            <motion.div
              layout
              className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-inner shadow-black/40"
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Total SOL earned while sleeping
              </div>
              <motion.p
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: SOLANA_ACCENT }}
                key={lifetimeEarnedSol.toFixed(12)}
                initial={{ scale: 1.03 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                +
                {lifetimeEarnedSol.toFixed(8)}{" "}
                <span className="text-base font-medium text-zinc-400">SOL</span>
              </motion.p>
              <p className="mt-2 text-xs text-zinc-500">
                Lifetime (this browser). Never decreases; grows when session yield
                rises.
              </p>
            </motion.div>
          </div>

          {vaultAddress && (vaultLamports ?? 0n) > 0n && (
            <p className="group flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
              <span className="text-zinc-500">Vault PDA ·</span>
              <a
                href={getExplorerUrl(`/address/${vaultAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300"
              >
                {vaultAddress}
              </a>
            </p>
          )}

          <div className="border-t border-white/10 pt-4 text-xs text-zinc-500">
            {pythQuote.isLoading && !pythQuote.data && (
              <p>Pyth Hermes: loading SOL + JitoSOL quotes…</p>
            )}
            {pythQuote.error && (
              <p className="text-red-400">
                Pyth:{" "}
                {pythQuote.error instanceof Error
                  ? pythQuote.error.message
                  : String(pythQuote.error)}
              </p>
            )}
            {pythQuote.data && !pythQuote.error && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                Pyth ~2s ·{" "}
                <span className="font-mono text-zinc-400">
                  {formatJitosolLike(pythQuote.data.jitosolPerSol)} JitoSOL / SOL
                </span>
                {pythQuote.data.publishTimeEarliestSec > 0 && (
                  <span className="opacity-80">
                    · t≈{" "}
                    {new Date(
                      pythQuote.data.publishTimeEarliestSec * 1000,
                    ).toLocaleTimeString()}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4 border-t border-white/10 pt-6">
          <div className="space-y-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Deposit
            </p>
            <div className="flex flex-wrap gap-3">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="SOL amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSending}
                className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/30 disabled:pointer-events-none disabled:opacity-50"
              />
              <button
                onClick={handleDeposit}
                disabled={isSending || !amount || parseFloat(amount) <= 0}
                className="rounded-xl bg-gradient-to-r from-[#14F195]/90 to-emerald-600/90 px-6 py-2.5 text-sm font-semibold text-neutral-950 shadow-lg shadow-[#14F195]/20 transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              >
                {isSending ? "Confirming…" : "Deposit"}
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Withdraw partial
            </p>
            <div className="flex flex-wrap gap-3">
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="SOL to wallet"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                disabled={isSending}
                className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 disabled:pointer-events-none disabled:opacity-50"
              />
              <button
                onClick={handleWithdrawPartial}
                disabled={
                  isSending ||
                  !partialAmount ||
                  parseFloat(partialAmount) <= 0 ||
                  !vaultLamports
                }
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-sm transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-50"
              >
                {isSending ? "Confirming…" : "Withdraw partial"}
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Send from vault
            </p>
            <input
              type="text"
              placeholder="Recipient Solana address"
              value={sendRecipient}
              onChange={(e) => setSendRecipient(e.target.value)}
              disabled={isSending}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 disabled:pointer-events-none disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-3">
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="SOL amount"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                disabled={isSending}
                className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 disabled:pointer-events-none disabled:opacity-50"
              />
              <button
                onClick={handleSendTo}
                disabled={
                  isSending ||
                  !sendRecipient.trim() ||
                  !sendAmount ||
                  parseFloat(sendAmount) <= 0 ||
                  !vaultLamports
                }
                className="rounded-xl bg-gradient-to-r from-violet-500/90 to-indigo-600/90 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              >
                {isSending ? "Confirming…" : "Send"}
              </button>
            </div>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={isSending || !vaultLamports}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 shadow-sm transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
          >
            {isSending ? "Confirming…" : "Withdraw all (full drain)"}
          </button>
        </div>
      </section>
    </PremiumShell>
  );
}

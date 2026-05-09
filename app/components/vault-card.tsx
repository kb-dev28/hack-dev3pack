"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useBalance } from "../lib/hooks/use-balance";
import { usePythJitosolQuote } from "../lib/hooks/use-pyth-jitosol-quote";
import { useSimulatedJitoYield } from "../lib/hooks/use-simulated-jito-yield";
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

  const heroJito =
    simulated != null ? simulated.totalJito : (jitosolEquiv ?? null);

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
      <section className="w-full space-y-4 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-lg font-semibold">YieldLink Vault</p>
          <p className="text-sm text-muted">
            Connect your wallet to interact with the vault program.
          </p>
        </div>
        <div className="rounded-lg bg-cream/50 p-4 text-center text-sm text-muted">
          Wallet not connected
        </div>
      </section>
    );
  }

  return (
    <section className="w-full space-y-4 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold">YieldLink Vault</p>
          <p className="text-sm text-muted">
            SOL lives on-chain in your PDA · JitoSOL is a UX headline from Pyth
            ratios; demo yield ticks in the UI only (no liquid stake in this
            MVP).
          </p>
        </div>
        <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80">
          {(vaultLamports ?? 0n) > 0n ? "Has funds" : "Empty"}
        </span>
      </div>

      <div className="rounded-xl border border-border-low bg-cream/30 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">
          Position (primary: JitoSOL equivalent)
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums leading-tight">
          ~
          {heroJito != null
            ? formatJitosolLike(heroJito)
            : vaultLamports && vaultLamports > 0n
              ? "—"
              : formatJitosolLike(0)}{" "}
          <span className="text-lg font-normal text-muted">JitoSOL</span>
        </p>
        {simulated && (
          <p className="text-xs text-muted">
            Principal ~{formatJitosolLike(simulated.principalJito)} + demo
            accrual (~{(simulated.apr * 100).toFixed(0)}% APR, UI-only)
          </p>
        )}
        <div className="text-sm text-muted space-y-1">
          {vaultLamports && vaultLamports > 0n && (
            <>
              <p className="text-foreground/90">
                <span className="font-medium tabular-nums">
                  {lamportsToSolString(vaultLamports)}
                </span>{" "}
                <span>SOL backing</span>
                {" · "}
                <span className="tabular-nums font-medium">
                  {usdEquiv != null ? formatUsd(usdEquiv) : "—"}
                </span>{" "}
                <span>(SOL/USD)</span>
              </p>
              {simulated && simulated.yieldJito > 0 && (
                <p className="rounded-md bg-cream/60 px-2 py-1.5 text-xs text-foreground/90 tabular-nums">
                  Simulated accrued:{" "}
                  <span className="font-semibold">
                    +{formatJitosolLike(simulated.yieldJito)} JitoSOL
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold">
                    {formatUsd(simulated.yieldUsd)}
                  </span>{" "}
                  · ticking {formatDurationSec(simulated.elapsedSec)}
                </p>
              )}
              {pythQuote.data && (
                <p className="text-xs">
                  Ratio (Pyth spot):{" "}
                  <span className="tabular-nums font-mono">
                    {formatJitosolLike(pythQuote.data.jitosolPerSol)} JitoSOL /
                    SOL
                  </span>
                  {pythQuote.data.publishTimeEarliestSec > 0 && (
                    <span className="ml-1 opacity-70">
                      · feed t≈{" "}
                      {new Date(
                        pythQuote.data.publishTimeEarliestSec * 1000
                      ).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
          {vaultAddress && (vaultLamports ?? 0n) > 0n && (
            <p className="group flex items-center gap-1.5 pt-1">
              <a
                href={getExplorerUrl(`/address/${vaultAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-xs text-muted underline underline-offset-2"
              >
                {vaultAddress}
              </a>
              <span
                className="relative cursor-default text-muted"
                title="Program-derived vault PDA holding your deposited SOL. Only you may withdraw or send from it via this program."
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </p>
          )}
        </div>
        <div className="border-t border-border-low pt-3 text-xs text-muted">
          {pythQuote.isLoading && !pythQuote.data && (
            <p>Pyth Hermes: loading SOL + JitoSOL quotes…</p>
          )}
          {pythQuote.error && (
            <p className="text-destructive">
              Pyth:{" "}
              {pythQuote.error instanceof Error
                ? pythQuote.error.message
                : String(pythQuote.error)}
            </p>
          )}
          {pythQuote.data && !pythQuote.error && (
            <p>
              Pyth refreshed every ~2s from{" "}
              <span className="font-mono">hermes.pyth.network</span> (mainnet
              spot).
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted">Deposit</p>
        <div className="flex gap-3 flex-wrap">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount in SOL → JitoSOL position"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isSending}
            className="min-w-[10rem] flex-1 rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30 disabled:opacity-50 disabled:pointer-events-none"
          />
          <button
            onClick={handleDeposit}
            disabled={isSending || !amount || parseFloat(amount) <= 0}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSending ? "Confirming…" : "Deposit"}
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border-low bg-card/50 p-4">
        <p className="text-xs uppercase tracking-wide text-muted">
          Withdraw partial (keeps rent on vault)
        </p>
        <div className="flex gap-3 flex-wrap">
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="SOL to your wallet"
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
            disabled={isSending}
            className="min-w-[10rem] flex-1 rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30 disabled:opacity-50 disabled:pointer-events-none"
          />
          <button
            onClick={handleWithdrawPartial}
            disabled={
              isSending ||
              !partialAmount ||
              parseFloat(partialAmount) <= 0 ||
              !vaultLamports
            }
            className="rounded-lg border border-border-low bg-cream px-4 py-2.5 text-sm font-medium shadow-xs transition hover:bg-cream/80 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSending ? "Confirming…" : "Withdraw partial"}
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border-low bg-card/50 p-4">
        <p className="text-xs uppercase tracking-wide text-muted">
          Send to recipient (from vault)
        </p>
        <input
          type="text"
          placeholder="Recipient Solana address"
          value={sendRecipient}
          onChange={(e) => setSendRecipient(e.target.value)}
          disabled={isSending}
          className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 font-mono text-xs outline-none transition placeholder:text-muted focus:border-foreground/30 disabled:opacity-50 disabled:pointer-events-none"
        />
        <div className="flex gap-3 flex-wrap">
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="SOL amount"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            disabled={isSending}
            className="min-w-[10rem] flex-1 rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30 disabled:opacity-50 disabled:pointer-events-none"
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
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSending ? "Confirming…" : "Send"}
          </button>
        </div>
      </div>

      <button
        onClick={handleWithdraw}
        disabled={isSending || !vaultLamports}
        className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm font-medium shadow-xs transition hover:bg-cream disabled:opacity-50 disabled:pointer-events-none"
      >
        {isSending ? "Confirming…" : "Withdraw all (full drain)"}
      </button>

      <div className="border-t border-border-low pt-4 text-xs text-muted">
        <p className="mb-2">
          This vault is an{" "}
          <a
            href="https://www.anchor-lang.com/docs"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Anchor program
          </a>{" "}
          on devnet: balances are SOL lamports only. JitoSOL and the ticking
          “accrued” line use Pyth + a local time-based demo (sessionStorage per
          vault); not transferable JitoSOL and not real staking yield.
        </p>
      </div>
    </section>
  );
}

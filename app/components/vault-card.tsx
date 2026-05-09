"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  HelpCircle,
  Info,
  Zap,
} from "lucide-react";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useBalance } from "../lib/hooks/use-balance";
import { usePythJitosolQuote } from "../lib/hooks/use-pyth-jitosol-quote";
import { useSimulatedJitoYield } from "../lib/hooks/use-simulated-jito-yield";
import { useLifetimeSolEarned } from "../lib/hooks/use-lifetime-sol-earned";
import {
  lamportsFromSol,
  lamportsFromSolFloor,
  lamportsToSolString,
} from "../lib/lamports";
import { usdToSol } from "../lib/pyth/value-send";
import { address, type Address, type Lamports } from "@solana/kit";
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

function formatEur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

function formatMxn(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
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

function formatExecutedSol(lp: Lamports): string {
  const n = Number(lp) / 1_000_000_000;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(n);
}

type SendRefCurrency =
  | "usd"
  | "sol"
  | "btc"
  | "eth"
  | "xlm"
  | "eur"
  | "mxn"
  | "usdt";

type SmartSendDenom = "crypto" | "fiat";

const SMART_SEND_CRYPTO = [
  "sol",
  "btc",
  "eth",
  "xlm",
  "usdt",
] as const satisfies readonly SendRefCurrency[];

const SMART_SEND_FIAT = [
  "usd",
  "eur",
  "mxn",
] as const satisfies readonly SendRefCurrency[];

function isCryptoRef(c: SendRefCurrency): boolean {
  return (SMART_SEND_CRYPTO as readonly string[]).includes(c);
}

function isFiatRef(c: SendRefCurrency): boolean {
  return (SMART_SEND_FIAT as readonly string[]).includes(c);
}

function sendRefGlyph(c: SendRefCurrency): string {
  switch (c) {
    case "usd":
      return "$";
    case "sol":
      return "◎";
    case "btc":
      return "₿";
    case "eth":
      return "Ξ";
    case "xlm":
      return "✶";
    case "eur":
      return "€";
    case "mxn":
      return "MXN";
    case "usdt":
      return "₮";
    default:
      return "";
  }
}

function buildSendCta(
  lamports: Lamports,
  inputAmount: number,
  sendRefCurrency: SendRefCurrency,
  pyth:
    | {
        solUsd: number;
        btcUsd: number;
        ethUsd: number;
        xlmUsd: number;
        usdtUsd: number;
      }
    | undefined
    | null
): string {
  const solStr = formatExecutedSol(lamports);
  switch (sendRefCurrency) {
    case "usd":
      return `Send ${solStr} SOL (${formatUsd(inputAmount)})`;
    case "sol":
      return pyth
        ? `Send ${solStr} SOL (${formatUsd(inputAmount * pyth.solUsd)})`
        : `Send ${solStr} SOL`;
    case "btc":
      return `Send ${solStr} SOL (${inputAmount} BTC)`;
    case "eth":
      return `Send ${solStr} SOL (${inputAmount} ETH)`;
    case "xlm":
      return `Send ${solStr} SOL (${inputAmount} XLM)`;
    case "eur":
      return `Send ${solStr} SOL (${formatEur(inputAmount)})`;
    case "mxn":
      return `Send ${solStr} SOL (${formatMxn(inputAmount)})`;
    case "usdt":
      return `Send ${solStr} SOL (${inputAmount} USDT)`;
    default:
      return `Send ${solStr} SOL`;
  }
}

function splitFixed8(n: number): {
  intPart: string;
  fracA: string;
  fracB: string;
} {
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
      <div className="rounded-3xl bg-neutral-950/55 backdrop-blur-md">
        {children}
      </div>
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
  const [smartSendDenom, setSmartSendDenom] =
    useState<SmartSendDenom>("crypto");
  const [sendRefCurrency, setSendRefCurrency] =
    useState<SendRefCurrency>("sol");
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null);
  const [vaultHubTab, setVaultHubTab] = useState<"deposit" | "withdraw">(
    "deposit"
  );

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

  const simulated = useSimulatedJitoYield({
    vaultPda: vaultAddress ? String(vaultAddress) : null,
    vaultLamports: vaultLamports ?? null,
    jitosolPerSol: pythQuote.data?.jitosolPerSol,
    jitosolUsd: pythQuote.data?.jitosolUsd,
    hasPyth: Boolean(pythQuote.data),
  });

  const dynamicSolTarget =
    simulated != null ? simulated.dynamicSol : hasVaultFunds ? solInVault : 0;

  const animatedSol = useAnimatedSol(dynamicSolTarget, Boolean(simulated));

  const sessionYieldSol = simulated?.yieldSol ?? null;

  const lifetimeEarnedSol = useLifetimeSolEarned(
    walletKey,
    sessionYieldSol,
    hasVaultFunds
  );

  const parts = splitFixed8(animatedSol);

  const heroUsdApprox =
    pythQuote.data != null &&
    (hasVaultFunds || (Number.isFinite(animatedSol) && animatedSol > 0))
      ? animatedSol * pythQuote.data.solUsd
      : null;

  const smartSend = useMemo(() => {
    const raw = sendAmount.trim();
    if (!raw) {
      return {
        kind: "empty" as const,
        lamports: null as Lamports | null,
        inputAmount: null as number | null,
      };
    }
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        kind: "invalid" as const,
        lamports: null,
        inputAmount: null,
      };
    }

    const p = pythQuote.data;

    if (sendRefCurrency === "sol") {
      const lp = lamportsFromSol(n);
      return {
        kind: "ok" as const,
        lamports: lp,
        inputAmount: n,
        sendRefCurrency,
      };
    }

    if (!p) {
      return {
        kind: "no_pyth" as const,
        lamports: null,
        inputAmount: n,
      };
    }

    let sol = NaN;
    if (sendRefCurrency === "usd") {
      sol = usdToSol(n, p.solUsd);
    } else if (sendRefCurrency === "btc") {
      sol = usdToSol(n * p.btcUsd, p.solUsd);
    } else if (sendRefCurrency === "eth") {
      sol = usdToSol(n * p.ethUsd, p.solUsd);
    } else if (sendRefCurrency === "xlm") {
      sol = usdToSol(n * p.xlmUsd, p.solUsd);
    } else if (sendRefCurrency === "eur") {
      sol = usdToSol(n * p.eurUsd, p.solUsd);
    } else if (sendRefCurrency === "mxn") {
      sol = usdToSol(n / p.usdMxn, p.solUsd);
    } else if (sendRefCurrency === "usdt") {
      sol = usdToSol(n * p.usdtUsd, p.solUsd);
    }

    if (!Number.isFinite(sol) || sol <= 0) {
      return {
        kind: "invalid" as const,
        lamports: null,
        inputAmount: n,
      };
    }

    const lp = lamportsFromSolFloor(sol);
    if (lp <= 0n) {
      return {
        kind: "dust" as const,
        lamports: lp,
        inputAmount: n,
        sendRefCurrency: sendRefCurrency,
      };
    }
    return {
      kind: "ok" as const,
      lamports: lp,
      inputAmount: n,
      sendRefCurrency,
    };
  }, [sendAmount, sendRefCurrency, pythQuote.data]);

  const sendCtaLabel =
    smartSend.kind === "ok" &&
    smartSend.lamports &&
    smartSend.inputAmount != null
      ? buildSendCta(
          smartSend.lamports,
          smartSend.inputAmount,
          smartSend.sendRefCurrency,
          pythQuote.data
        )
      : null;

  const smartSendDenomOptions =
    smartSendDenom === "crypto"
      ? ([
          ["sol", "Solana (SOL)"],
          ["btc", "Bitcoin (BTC)"],
          ["eth", "Ethereum (ETH)"],
          ["xlm", "Stellar (XLM)"],
          ["usdt", "Tether (USDT)"],
        ] as const)
      : ([
          ["usd", "US Dollar (USD)"],
          ["eur", "Euro (EUR)"],
          ["mxn", "Mexican peso (MXN)"],
        ] as const);

  const smartSendCryptoBtnClass =
    "min-h-[3rem] shrink-0 rounded-xl bg-gradient-to-r from-[#14F195] via-emerald-500 to-teal-600 px-5 py-2.5 text-center text-sm font-semibold tracking-tight text-neutral-950 shadow-lg shadow-emerald-900/35 outline-none ring-1 ring-white/15 transition hover:brightness-[1.05] disabled:pointer-events-none disabled:opacity-45";

  const smartSendFiatBtnClass =
    "min-h-[3rem] shrink-0 rounded-xl bg-gradient-to-r from-sky-500 via-blue-700 to-[#173a94] px-5 py-2.5 text-center text-sm font-semibold tracking-tight text-white shadow-lg shadow-blue-950/45 outline-none ring-1 ring-white/20 transition hover:brightness-[1.06] disabled:pointer-events-none disabled:opacity-45";

  const sendAmountStep =
    sendRefCurrency === "usd"
      ? "0.01"
      : sendRefCurrency === "sol"
        ? "0.0001"
        : sendRefCurrency === "btc"
          ? "0.0000001"
          : sendRefCurrency === "eth"
            ? "0.000001"
            : sendRefCurrency === "eur"
              ? "0.01"
              : sendRefCurrency === "mxn"
                ? "1"
                : sendRefCurrency === "xlm"
                  ? "1"
                  : sendRefCurrency === "usdt"
                    ? "0.01"
                    : "1";

  const sendAmountPlaceholder =
    sendRefCurrency === "usd"
      ? "20.00"
      : sendRefCurrency === "sol"
        ? "0.25"
        : sendRefCurrency === "btc"
          ? "0.00042"
          : sendRefCurrency === "eth"
            ? "0.02"
            : sendRefCurrency === "eur"
              ? "25"
              : sendRefCurrency === "mxn"
                ? "350"
                : sendRefCurrency === "xlm"
                  ? "250"
                  : sendRefCurrency === "usdt"
                    ? "100"
                    : "20";

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
    if (!walletAddress || !vaultAddress || !signer || !sendAmount.trim())
      return;

    if (smartSend.kind === "no_pyth") {
      toast.error("Wait for Pyth quotes or choose SOL as the reference.");
      return;
    }
    if (smartSend.kind === "empty" || smartSend.kind === "invalid") {
      toast.error("Enter a valid amount.");
      return;
    }
    if (smartSend.kind === "dust") {
      toast.error("Amount rounds to zero lamports after conversion.");
      return;
    }
    if (
      smartSend.kind !== "ok" ||
      !smartSend.lamports ||
      smartSend.lamports <= 0n
    ) {
      toast.error("Invalid send amount.");
      return;
    }

    if (vaultLamports != null && smartSend.lamports > vaultLamports) {
      toast.error("Insufficient vault balance.", {
        description: `Vault holds ~${lamportsToSolString(vaultLamports, 6)} SOL.`,
      });
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
        amount: smartSend.lamports,
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
    smartSend,
    vaultLamports,
  ]);

  if (status !== "connected") {
    return (
      <PremiumShell>
        <section className="w-full space-y-4 p-6 sm:p-8">
          <p className="text-sm text-zinc-400">Connect your wallet.</p>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-zinc-500">
            Not connected
          </div>
        </section>
      </PremiumShell>
    );
  }

  return (
    <PremiumShell>
      <section className="w-full space-y-6 p-6 sm:p-8">
        {/* Hero — SOL-first, technically honest */}
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-medium tracking-tight text-zinc-100 sm:text-xl">
              YieldLink
            </h2>
            <button
              type="button"
              className="group relative shrink-0 rounded-full p-1.5 text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Technical details"
            >
              <HelpCircle className="h-5 w-5" strokeWidth={1.75} />
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-white/12 bg-neutral-950/95 px-3.5 py-2.5 text-left text-[11px] font-normal leading-relaxed text-zinc-300 shadow-xl backdrop-blur-md opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
              >
                Technical Stack: PDA-based Vault (Devnet) | Price Discovery via
                Pyth Network Hermes | Simulated Value Accrual based on
                JitoSOL/SOL historical ratio. This MVP demonstrates live value
                growth without locking capital.
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <motion.div
              className="font-mono tabular-nums text-5xl font-semibold leading-none tracking-tight text-zinc-50 sm:text-6xl md:text-7xl"
              layout
            >
              <span className="select-none">{parts.intPart}</span>
              <span className="text-zinc-600">.</span>
              <span className="text-zinc-300">{parts.fracA}</span>
              <motion.span
                className="inline-block min-w-[4.5ch] text-zinc-200"
                key={parts.fracB}
                initial={{ y: 3, opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              >
                {parts.fracB}
              </motion.span>
              <span className="ml-1.5 text-2xl font-medium text-zinc-500 sm:text-3xl md:text-4xl">
                SOL
              </span>
            </motion.div>
            {(vaultLamports ?? 0n) > 0n && pythQuote.data && (
              <span className="shrink-0 self-start rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/95 sm:self-center">
                Yield Accrual Active
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            Position held in JitoSOL — displayed in SOL for readability. Vault
            balance is native SOL on-chain.
          </p>
          <p className="text-sm text-neutral-500">
            {heroUsdApprox != null
              ? `≈ ${formatUsd(heroUsdApprox)} USD`
              : pythQuote.isLoading
                ? "USD estimate loading…"
                : "—"}
          </p>
          <p className="text-[11px] text-zinc-600">
            Rates powered by Pyth Network
            {pythQuote.data && (
              <>
                {" "}
                ·{" "}
                <span className="font-mono text-zinc-500">
                  {formatJitosolLike(pythQuote.data.jitosolPerSol)} JitoSOL/SOL
                </span>
              </>
            )}
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <motion.div
              layout
              className="rounded-xl border border-white/10 bg-black/25 p-3 shadow-inner shadow-black/30"
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                <Zap className="h-3 w-3 text-emerald-400/80" />
                Value Accrued
              </div>
              <p className="font-mono text-xl font-semibold tabular-nums text-emerald-400">
                +{(simulated?.yieldSol ?? 0).toFixed(8)}{" "}
                <span className="text-sm font-normal text-zinc-500">SOL</span>
              </p>
              <p className="mt-1.5 text-[10px] text-zinc-500">
                Session · ~8% APR reference ·{" "}
                <span className="font-mono text-zinc-400">
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
              className="rounded-xl border border-white/10 bg-black/20 p-3 shadow-inner shadow-black/30"
            >
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Lifetime accrual
              </div>
              <motion.p
                className="font-mono text-xl font-semibold tabular-nums text-emerald-400"
                key={lifetimeEarnedSol.toFixed(12)}
                initial={{ scale: 1.02 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                +{lifetimeEarnedSol.toFixed(8)}{" "}
                <span className="text-sm font-normal text-zinc-500">SOL</span>
              </motion.p>
              <p className="mt-1.5 text-[10px] text-zinc-500">
                Cumulative in this browser (does not decrease on withdraw).
              </p>
            </motion.div>
          </div>

          {vaultAddress && (vaultLamports ?? 0n) > 0n && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
              <span>Vault PDA</span>
              <a
                href={getExplorerUrl(`/address/${vaultAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
              >
                {vaultAddress}
              </a>
            </p>
          )}

          {(pythQuote.isLoading || pythQuote.error) && (
            <div className="border-t border-white/10 pt-3 text-[11px] text-zinc-500">
              {pythQuote.isLoading && !pythQuote.data && (
                <p>Loading Hermes price feeds…</p>
              )}
              {pythQuote.error && (
                <p className="text-red-400/90">
                  {pythQuote.error instanceof Error
                    ? pythQuote.error.message
                    : String(pythQuote.error)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4 border-t border-white/10 pt-6">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-4 backdrop-blur-md">
            <p className="mb-3 text-sm font-medium tracking-tight text-zinc-300">
              Vault Management Hub
            </p>

            <div className="relative mb-4 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setVaultHubTab("deposit")}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
                  vaultHubTab === "deposit"
                    ? "text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {vaultHubTab === "deposit" && (
                  <motion.div
                    layoutId="vaultHubTabIndicator"
                    className="absolute inset-0 rounded-lg bg-[#14F195]/18 ring-1 ring-[#14F195]/35"
                    transition={{
                      type: "spring",
                      stiffness: 440,
                      damping: 34,
                    }}
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 shrink-0 text-[#14F195]" />
                  Deposit
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVaultHubTab("withdraw")}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
                  vaultHubTab === "withdraw"
                    ? "text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {vaultHubTab === "withdraw" && (
                  <motion.div
                    layoutId="vaultHubTabIndicator"
                    className="absolute inset-0 rounded-lg bg-blue-500/20 ring-1 ring-blue-400/35"
                    transition={{
                      type: "spring",
                      stiffness: 440,
                      damping: 34,
                    }}
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4 shrink-0 text-sky-400" />
                  Withdraw
                </span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {vaultHubTab === "deposit" ? (
                <motion.div
                  key="hub-deposit"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount (SOL)"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isSending}
                      className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/30 disabled:pointer-events-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleDeposit}
                      disabled={isSending || !amount || parseFloat(amount) <= 0}
                      className="rounded-xl border border-white/15 bg-transparent px-6 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-[#14F195]/35 hover:bg-[#14F195]/5 disabled:pointer-events-none disabled:opacity-45"
                    >
                      {isSending ? "Confirming…" : "Deposit"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="hub-withdraw"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="Amount to your wallet (SOL)"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      disabled={isSending}
                      className="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 focus:ring-1 focus:ring-white/10 disabled:pointer-events-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleWithdrawPartial}
                      disabled={
                        isSending ||
                        !partialAmount ||
                        parseFloat(partialAmount) <= 0 ||
                        !vaultLamports
                      }
                      className="rounded-xl border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-white/25 hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-45"
                    >
                      {isSending ? "Confirming…" : "Withdraw"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={isSending || !vaultLamports}
                    className="w-full rounded-xl border border-white/20 bg-transparent py-2.5 text-sm font-medium text-zinc-400 transition hover:border-white/30 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-45"
                  >
                    {isSending ? "Confirming…" : "Withdraw All & Close Vault"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
                Smart send
              </p>
              <button
                type="button"
                className="group relative inline-flex shrink-0 rounded p-0.5 text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-[#14F195]/40"
                aria-label="How Smart send works"
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
                <span
                  role="tooltip"
                  className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-xl border border-white/12 bg-neutral-950/95 px-3.5 py-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-zinc-300 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)] backdrop-blur-md opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
                >
                  Powered by Pyth Real-Time Oracles. This module calculates the
                  exact SOL equivalent using global market rates (Hermes
                  Mainnet). Your funds stay earning yield in JitoSOL until the
                  millisecond of execution, ensuring zero idle capital.
                </span>
              </button>
            </div>

            <input
              type="text"
              placeholder="Recipient Solana address"
              value={sendRecipient}
              onChange={(e) => setSendRecipient(e.target.value)}
              disabled={isSending}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 focus:ring-1 focus:ring-violet-500/25 disabled:pointer-events-none disabled:opacity-50"
            />

            <motion.div
              layout
              className="space-y-3 text-[0.95rem] leading-relaxed"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    setSmartSendDenom("crypto");
                    setSendRefCurrency((prev) =>
                      isCryptoRef(prev) ? prev : "sol"
                    );
                    setSendAmount("");
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                    smartSendDenom === "crypto"
                      ? "bg-[#14F195]/20 text-[#14F195] ring-1 ring-[#14F195]/35"
                      : "bg-black/25 text-zinc-500 hover:text-zinc-300"
                  } disabled:opacity-50`}
                >
                  🌐 Crypto
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    setSmartSendDenom("fiat");
                    setSendRefCurrency((prev) =>
                      isFiatRef(prev) ? prev : "usd"
                    );
                    setSendAmount("");
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                    smartSendDenom === "fiat"
                      ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40"
                      : "bg-black/25 text-zinc-500 hover:text-zinc-300"
                  } disabled:opacity-50`}
                >
                  💵 Fiat
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-x-2 gap-y-2 text-zinc-400">
                <span className="shrink-0 text-zinc-500">I want to send</span>
                <span
                  className="pb-px text-lg tabular-nums"
                  style={{ color: SOLANA_ACCENT }}
                  aria-hidden
                >
                  {sendRefGlyph(sendRefCurrency)}
                </span>
                <input
                  type="number"
                  min="0"
                  step={sendAmountStep}
                  inputMode="decimal"
                  placeholder={sendAmountPlaceholder}
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  disabled={isSending}
                  className="w-[7.25rem] border-0 border-b border-zinc-600 bg-transparent pb-px text-lg font-semibold tabular-nums text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#14F195]/70 disabled:opacity-50 sm:w-36 md:w-44"
                />
                <span className="pb-px text-zinc-500">as</span>
                <label className="relative inline-flex items-center pb-px">
                  <select
                    value={sendRefCurrency}
                    aria-label="Reference currency"
                    onChange={(e) => {
                      setSendRefCurrency(e.target.value as SendRefCurrency);
                      setSendAmount("");
                    }}
                    disabled={isSending}
                    className="h-10 min-w-[13.5rem] max-w-[min(100vw-2rem,20rem)] cursor-pointer appearance-none rounded-xl border border-white/15 bg-black/35 py-2 pl-3 pr-9 text-sm font-medium text-zinc-100 outline-none transition hover:bg-black/45 focus-visible:ring-1 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {smartSendDenomOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden
                  />
                </label>
              </div>

              {(sendRefCurrency === "eur" || sendRefCurrency === "mxn") && (
                <p className="text-[0.7rem] font-medium leading-snug text-amber-400/95">
                  Nota: Los mercados FX cierran los fines de semana; el precio
                  de Pyth será el último cierre.
                </p>
              )}

              <p className="min-h-[1.375rem] text-sm text-zinc-400">
                {smartSend.kind === "ok" && smartSend.lamports != null ? (
                  <>
                    The recipient will receive exactly{" "}
                    <span className="font-mono text-base font-medium text-zinc-100">
                      {formatExecutedSol(smartSend.lamports)}
                    </span>{" "}
                    SOL.
                  </>
                ) : smartSend.kind === "no_pyth" ? (
                  <span className="text-amber-300/95">
                    Load Pyth Hermes—or pick SOL as the reference (works
                    offline).
                  </span>
                ) : smartSend.kind === "dust" ? (
                  <span className="text-amber-300/95">
                    That amount rounds to fewer than 1 lamport—try a larger
                    value.
                  </span>
                ) : sendAmount.trim() !== "" && smartSend.kind === "invalid" ? (
                  <span className="text-red-400/90">
                    Enter a positive number.
                  </span>
                ) : null}
              </p>

              {sendRefCurrency === "usd" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[0.65rem] uppercase tracking-wider text-zinc-600">
                    Quick
                  </span>
                  {[10, 20, 50].map((usd) => (
                    <button
                      key={usd}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setSmartSendDenom("fiat");
                        setSendRefCurrency("usd");
                        setSendAmount(String(usd));
                      }}
                      className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-300 transition hover:border-blue-400/35 hover:bg-blue-500/10 hover:text-blue-100 disabled:opacity-50"
                    >
                      ${usd}
                    </button>
                  ))}
                </div>
              )}

              {sendRefCurrency === "sol" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[0.65rem] uppercase tracking-wider text-zinc-600">
                    Quick
                  </span>
                  {[0.1, 0.5, 1].map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setSmartSendDenom("crypto");
                        setSendRefCurrency("sol");
                        setSendAmount(String(s));
                      }}
                      className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-300 transition hover:border-[#14F195]/35 hover:bg-[#14F195]/10 hover:text-[#14F195] disabled:opacity-50"
                    >
                      {s}&nbsp;SOL
                    </button>
                  ))}
                </div>
              )}

              {sendRefCurrency === "eur" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[0.65rem] uppercase tracking-wider text-zinc-600">
                    Quick
                  </span>
                  {[10, 25, 50].map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setSmartSendDenom("fiat");
                        setSendRefCurrency("eur");
                        setSendAmount(String(e));
                      }}
                      className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-300 transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
                    >
                      {formatEur(e)}
                    </button>
                  ))}
                </div>
              )}

              {sendRefCurrency === "mxn" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[0.65rem] uppercase tracking-wider text-zinc-600">
                    Quick
                  </span>
                  {[100, 500, 1000].map((pesos) => (
                    <button
                      key={pesos}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setSmartSendDenom("fiat");
                        setSendRefCurrency("mxn");
                        setSendAmount(String(pesos));
                      }}
                      className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-300 transition hover:border-teal-400/35 hover:bg-teal-500/10 hover:text-teal-200 disabled:opacity-50"
                    >
                      {pesos}&nbsp;MXN
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={handleSendTo}
                disabled={
                  isSending ||
                  !sendRecipient.trim() ||
                  !sendAmount.trim() ||
                  !vaultLamports ||
                  smartSend.kind !== "ok" ||
                  (smartSend.kind === "ok" &&
                    vaultLamports != null &&
                    smartSend.lamports != null &&
                    smartSend.lamports > vaultLamports)
                }
                className={
                  smartSendDenom === "crypto"
                    ? smartSendCryptoBtnClass
                    : smartSendFiatBtnClass
                }
              >
                {isSending ? "Confirming…" : (sendCtaLabel ?? "Send")}
              </button>

              <div className="min-w-0 flex-1 text-xs text-zinc-500">
                {smartSend.kind === "ok" &&
                  smartSend.lamports != null &&
                  vaultLamports != null &&
                  smartSend.lamports > vaultLamports && (
                    <p className="text-red-400">
                      Vault only has ~{lamportsToSolString(vaultLamports, 6)}{" "}
                      SOL principal.
                    </p>
                  )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PremiumShell>
  );
}

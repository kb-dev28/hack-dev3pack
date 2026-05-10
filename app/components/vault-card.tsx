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
  Copy,
  HelpCircle,
  Info,
} from "lucide-react";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useBalance } from "../lib/hooks/use-balance";
import { usePythJitosolQuote } from "../lib/hooks/use-pyth-jitosol-quote";
import { useSimulatedJitoYield } from "../lib/hooks/use-simulated-jito-yield";
import {
  lamportsFromSol,
  lamportsFromSolFloor,
  lamportsToSolString,
} from "../lib/lamports";
import { usdToSol } from "../lib/pyth/value-send";
import { address, lamports as sol, type Address, type Lamports } from "@solana/kit";
import { toast } from "sonner";
import {
  getDepositInstruction,
  getWithdrawInstruction,
  getWithdrawInstructionAsync,
  getWithdrawPartialInstruction,
  getSendToInstruction,
} from "../generated/vault";
import { parseTransactionError } from "../lib/errors";
import { ellipsify } from "../lib/explorer";
import {
  getProtocolTreasuryAddress,
  protocolFeeLamports,
  protocolSendFeePercentLabel,
} from "../lib/protocol-fee";
import { useSolanaClient } from "../lib/solana-client-context";
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

/** Hero fiat line: ≈ $X,XXX.XX (no duplicate “USD” after symbol). */
function formatUsdApproxHero(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  const { cluster, getExplorerUrl } = useCluster();
  const solanaClient = useSolanaClient();

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
  const [vaultPanelOpen, setVaultPanelOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  const protocolTreasury = useMemo(() => getProtocolTreasuryAddress(), []);

  const selectVaultHubTab = useCallback((t: "deposit" | "withdraw") => {
    if (vaultHubTab === t) {
      setVaultPanelOpen((open) => !open);
    } else {
      setVaultHubTab(t);
      setVaultPanelOpen(true);
    }
  }, [vaultHubTab]);

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

  const smartSendFeePreview = useMemo(() => {
    if (
      smartSend.kind !== "ok" ||
      smartSend.lamports == null ||
      !protocolTreasury ||
      !vaultAddress
    ) {
      return null;
    }
    if (protocolTreasury === vaultAddress) return null;
    const gross = smartSend.lamports;
    const fee = protocolFeeLamports(gross);
    if (fee <= 0n) return null;
    return { gross, fee, net: gross - fee };
  }, [smartSend, protocolTreasury, vaultAddress]);

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
    "min-h-[3.25rem] shrink-0 rounded-xl bg-gradient-to-r from-[#14F195] via-emerald-500 to-teal-600 px-6 py-3 text-center text-base font-semibold tracking-tight text-neutral-950 shadow-lg shadow-emerald-900/35 outline-none ring-1 ring-white/15 transition hover:brightness-[1.05] disabled:pointer-events-none disabled:opacity-45";

  const smartSendFiatBtnClass =
    "min-h-[3.25rem] shrink-0 rounded-xl bg-gradient-to-r from-sky-500 via-blue-700 to-[#173a94] px-6 py-3 text-center text-base font-semibold tracking-tight text-white shadow-lg shadow-blue-950/45 outline-none ring-1 ring-white/20 transition hover:brightness-[1.06] disabled:pointer-events-none disabled:opacity-45";

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
      const gross = smartSend.lamports;
      const treasury =
        protocolTreasury &&
        vaultAddress &&
        protocolTreasury !== vaultAddress
          ? protocolTreasury
          : null;
      const feeLamports = treasury ? protocolFeeLamports(gross) : 0n;
      const recipientLamports = gross - feeLamports;

      if (recipientLamports <= 0n) {
        toast.error("Amount too small after protocol fee.");
        return;
      }

      const instructions = [
        getSendToInstruction({
          signer,
          vault: vaultAddress,
          recipient: recipientAddr,
          amount: recipientLamports,
        }),
      ];
      if (feeLamports > 0n && treasury) {
        instructions.push(
          getSendToInstruction({
            signer,
            vault: vaultAddress,
            recipient: treasury,
            amount: feeLamports,
          }),
        );
      }

      const signature = await send({ instructions });
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
    protocolTreasury,
  ]);

  const handleCopyVaultAddress = useCallback(() => {
    if (!vaultAddress) return;
    const s = String(vaultAddress);
    void navigator.clipboard.writeText(s).then(
      () => {
        toast.success("Vault address copied");
      },
      () => {
        toast.error("Could not copy");
      }
    );
  }, [vaultAddress]);

  const handleCopyWalletAddress = useCallback(async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(String(walletAddress));
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 2000);
  }, [walletAddress]);

  const handleWalletAirdrop = useCallback(async () => {
    if (!walletAddress) return;
    try {
      toast.info("Requesting airdrop...");
      const sig = await solanaClient.airdrop(walletAddress, sol(1_000_000_000n));
      toast.success("Airdrop received!", {
        description: sig ? (
          <a
            href={getExplorerUrl(`/tx/${sig}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ) : undefined,
      });
    } catch (err) {
      console.error("Airdrop failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        msg.includes("429") || msg.includes("Internal JSON-RPC error");
      toast.error(
        isRateLimited
          ? "Devnet faucet rate-limited. Use the web faucet instead."
          : "Airdrop failed. Try again later.",
        isRateLimited
          ? {
              description: (
                <a
                  href="https://faucet.solana.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open faucet.solana.com
                </a>
              ),
            }
          : undefined
      );
    }
  }, [walletAddress, solanaClient, getExplorerUrl]);

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
      <section className="w-full space-y-1.5 p-2 sm:p-3">
        {/* Header: title + LIVE PYTH top-right */}
        <div className="flex w-full min-w-0 items-start justify-between gap-3 border-b border-white/10 pb-2">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold leading-[0.95] tracking-tight text-zinc-50 sm:text-5xl">
              EverYield
            </h1>
            <p className="mt-0.5 text-base leading-snug text-emerald-400/85 sm:text-lg">
              Grow perpetually, spend instantly.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start pt-1">
            <button
              type="button"
              className="group relative shrink-0 rounded-full p-1 text-zinc-400 outline-none transition hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Product and technical details"
            >
              <HelpCircle
                className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]"
                strokeWidth={1.75}
              />
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-white/12 bg-neutral-950/95 px-3.5 py-3.5 text-left shadow-xl backdrop-blur-md opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
              >
                <div className="space-y-2 border-b border-white/10 pb-2.5 text-[11px] leading-snug text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-200">
                      Strategy:
                    </span>{" "}
                    Assets are optimized in JitoSOL for real-time value
                    accrual.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-200">
                      Oracle:
                    </span>{" "}
                    Prices synced via Pyth Network Hermes (Mainnet).
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-200">
                      Safety:
                    </span>{" "}
                    Funds are held in a non-custodial PDA Vault (Devnet).
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-200">
                      Transparency:
                    </span>{" "}
                    The displayed SOL balance grows as the JitoSOL/SOL ratio
                    increases.
                  </p>
                </div>
                <div className="mt-2.5 space-y-2 text-[10px] leading-relaxed text-zinc-500">
                  <p>
                    <span className="font-semibold text-zinc-400">
                      Balance and display
                    </span>
                    <br />
                    Position held in JitoSOL — main number is SOL for
                    readability. On-chain balance is native SOL lamports in the
                    vault PDA.
                  </p>
                  {pythQuote.data && (
                    <p className="font-mono text-[10px] text-zinc-500">
                      <span className="font-sans font-semibold text-zinc-400">
                        Pyth spot ratio:
                      </span>{" "}
                      {formatJitosolLike(pythQuote.data.jitosolPerSol)} JitoSOL /
                      1 SOL
                    </p>
                  )}
                </div>
              </span>
            </button>
            {pythQuote.data && (
              <span className="inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400/90">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.45)] animate-pulse"
                  aria-hidden
                />
                LIVE PYTH FEED
              </span>
            )}
          </div>
        </div>

        {/* Long copy — band between header and control center */}
        <div className="border-b border-white/10 bg-white/[0.02] py-1.5">
          <p className="w-full text-[11px] leading-tight text-zinc-500 sm:text-xs">
            High-yield vault, liquid for spending — Jito & Pyth.
          </p>
        </div>

        {/* Unified control: Wallet | Vault | Actions (titles + Deposit/Withdraw top-aligned) */}
        <div className="space-y-1 border-b border-white/10 pb-1.5 pt-1.5">
          <div className="flex w-full min-w-0 flex-row flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 w-full max-w-[240px] shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 sm:w-[min(240px,34%)] sm:max-w-none">
              <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-semibold tracking-tight text-zinc-200 sm:text-xs">
                  Wallet balance
                </span>
                {cluster !== "mainnet" && (
                  <button
                    type="button"
                    onClick={handleWalletAirdrop}
                    className="shrink-0 cursor-pointer rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition hover:bg-white/5"
                  >
                    Airdrop
                  </button>
                )}
              </div>
              {walletAddress && (
                <button
                  type="button"
                  onClick={handleCopyWalletAddress}
                  className="mt-0.5 flex max-w-full cursor-pointer items-center gap-1.5 truncate font-mono text-[10px] text-zinc-400 transition hover:text-zinc-200"
                >
                  {ellipsify(walletAddress, 4)}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 shrink-0"
                  >
                    {walletCopied ? (
                      <path d="M20 6 9 17l-5-5" />
                    ) : (
                      <>
                        <rect
                          width="14"
                          height="14"
                          x="8"
                          y="8"
                          rx="2"
                          ry="2"
                        />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </>
                    )}
                  </svg>
                </button>
              )}
              <p className="mt-1 font-mono text-lg font-bold tabular-nums tracking-tight text-zinc-50 sm:text-xl">
                {walletLamports != null
                  ? lamportsToSolString(walletLamports)
                  : "\u2014"}
                <span className="ml-1 text-[10px] font-normal text-zinc-500 sm:text-xs">
                  SOL
                </span>
              </p>
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center px-0.5 pt-0 text-center sm:px-1.5">
              <div className="flex min-h-[1.75rem] w-full items-center justify-center">
                <span className="text-[11px] font-semibold tracking-tight text-zinc-200 sm:text-xs">
                  Vault balance
                </span>
              </div>
              <motion.div
                className="mt-0 font-mono tabular-nums text-xl font-semibold leading-none tracking-tight text-zinc-50 sm:text-2xl"
                layout
              >
                <span className="select-none">{parts.intPart}</span>
                <span className="text-zinc-600">.</span>
                <span className="text-zinc-300">{parts.fracA}</span>
                <motion.span
                  className="inline-block min-w-[3.5ch] text-zinc-200"
                  key={parts.fracB}
                  initial={{ y: 3, opacity: 0.5 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35,
                  }}
                >
                  {parts.fracB}
                </motion.span>
                <span className="ml-0.5 text-[10px] font-medium text-zinc-500 sm:text-xs">
                  SOL
                </span>
              </motion.div>
              <p className="mt-0 text-[10px] leading-tight text-zinc-500 sm:text-[11px]">
                JitoSOL
              </p>
              <p className="text-[10px] font-medium tabular-nums leading-tight text-zinc-600">
                {heroUsdApprox != null
                  ? `≈ ${formatUsdApproxHero(heroUsdApprox)}`
                  : pythQuote.isLoading
                    ? "…"
                    : "—"}
              </p>
            </div>

            <div className="flex w-full max-w-[240px] shrink-0 flex-col gap-0.5 self-start sm:w-max">
              <div className="relative inline-flex min-h-[1.75rem] shrink-0 items-center rounded-md border border-white/12 bg-black/45 p-px self-start">
              <button
                type="button"
                onClick={() => selectVaultHubTab("deposit")}
                className={`relative min-w-[3.75rem] rounded-[5px] px-1.5 py-1 text-[10px] font-semibold transition sm:min-w-[4rem] sm:px-2 sm:py-1.5 sm:text-[11px] ${
                  vaultHubTab === "deposit"
                    ? "text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {vaultHubTab === "deposit" && (
                  <motion.div
                    layoutId="vaultHubTabIndicator"
                    className="absolute inset-0 rounded-[5px] bg-[#14F195]/22 ring-1 ring-[#14F195]/35"
                    transition={{
                      type: "spring",
                      stiffness: 440,
                      damping: 34,
                    }}
                  />
                )}
                <span className="relative z-10 inline-flex items-center justify-center gap-0.5">
                  <ArrowDownCircle className="h-2.5 w-2.5 shrink-0 text-[#14F195] sm:h-3 sm:w-3" />
                  Deposit
                </span>
              </button>
              <button
                type="button"
                onClick={() => selectVaultHubTab("withdraw")}
                className={`relative min-w-[4rem] rounded-[5px] px-1.5 py-1 text-[10px] font-semibold transition sm:min-w-[4.25rem] sm:px-2 sm:py-1.5 sm:text-[11px] ${
                  vaultHubTab === "withdraw"
                    ? "text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {vaultHubTab === "withdraw" && (
                  <motion.div
                    layoutId="vaultHubTabIndicator"
                    className="absolute inset-0 rounded-[5px] bg-blue-500/25 ring-1 ring-blue-400/35"
                    transition={{
                      type: "spring",
                      stiffness: 440,
                      damping: 34,
                    }}
                  />
                )}
                <span className="relative z-10 inline-flex items-center justify-center gap-0.5">
                  <ArrowUpCircle className="h-2.5 w-2.5 shrink-0 text-sky-400 sm:h-3 sm:w-3" />
                  Withdraw
                </span>
              </button>
            </div>

          <AnimatePresence initial={false}>
            {vaultPanelOpen && (
              <motion.div
                key="vault-action-panel"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="w-full rounded-lg border border-white/10 bg-neutral-900/55 px-2 py-1.5 backdrop-blur-sm">
                      <AnimatePresence mode="wait">
                        {vaultHubTab === "deposit" ? (
                          <motion.div
                            key="hub-deposit"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18 }}
                            className="flex min-w-0 flex-row flex-wrap items-center gap-1.5"
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount (SOL)"
                              aria-label="Deposit amount in SOL"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              disabled={isSending}
                              className="min-w-0 flex-1 basis-[6rem] rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-[#14F195]/40 focus:ring-1 focus:ring-[#14F195]/25 disabled:pointer-events-none disabled:opacity-50"
                            />
                            <button
                              type="button"
                              onClick={handleDeposit}
                              disabled={
                                isSending ||
                                !amount ||
                                parseFloat(amount) <= 0
                              }
                              className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 transition hover:border-[#14F195]/45 hover:bg-[#14F195]/12 disabled:pointer-events-none disabled:opacity-45"
                            >
                              {isSending ? "…" : "Deposit"}
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="hub-withdraw"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18 }}
                            className="flex min-w-0 flex-row flex-wrap items-center gap-1.5"
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder="Amount"
                              aria-label="Partial withdraw amount in SOL to wallet"
                              value={partialAmount}
                              onChange={(e) =>
                                setPartialAmount(e.target.value)
                              }
                              disabled={isSending}
                              className="min-w-0 flex-1 basis-[5rem] rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-white/25 focus:ring-1 focus:ring-white/10 disabled:pointer-events-none disabled:opacity-50"
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
                              className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-[11px] font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-45"
                            >
                              {isSending ? "…" : "Partial"}
                            </button>
                            <button
                              type="button"
                              onClick={handleWithdraw}
                              disabled={isSending || !vaultLamports}
                              title="Withdraw all SOL and close the vault"
                              className="flex shrink-0 flex-col items-center justify-center rounded-md border border-white/18 bg-white/[0.04] px-2 py-1 text-center text-[10px] font-semibold leading-tight text-zinc-300 transition hover:border-white/28 hover:bg-white/[0.07] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-45"
                            >
                              {isSending ? (
                                "…"
                              ) : (
                                <>
                                  <span>Total</span>
                                  <span className="text-[9px] font-normal text-zinc-500">
                                    close
                                  </span>
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          </div>
        </div>

        {(pythQuote.isLoading || pythQuote.error) && (
          <div className="border-t border-white/10 pt-1.5 text-[10px] text-zinc-500">
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

        <div className="space-y-5 border-t border-white/10 pt-5 sm:pt-6">
          <div className="space-y-6 rounded-2xl border border-white/15 bg-white/[0.055] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] sm:p-8">
            <div className="flex items-center gap-3">
              <p className="text-lg font-semibold tracking-tight text-zinc-50 sm:text-xl">
                Smart send
              </p>
              <button
                type="button"
                className="group relative inline-flex shrink-0 rounded p-0.5 text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-[#14F195]/40"
                aria-label="How Smart send works"
              >
                <Info className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" strokeWidth={2.25} />
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 font-mono text-base text-zinc-200 outline-none transition placeholder:text-zinc-400 focus:border-white/25 focus:ring-2 focus:ring-violet-500/25 disabled:pointer-events-none disabled:opacity-50 sm:px-5 sm:py-[1.125rem]"
            />

            <motion.div
              layout
              className="space-y-4 text-base leading-relaxed text-zinc-300"
            >
              <div className="flex flex-wrap items-center gap-2">
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
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
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
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                    smartSendDenom === "fiat"
                      ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40"
                      : "bg-black/25 text-zinc-500 hover:text-zinc-300"
                  } disabled:opacity-50`}
                >
                  💵 Fiat
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2 text-zinc-400">
                <span className="shrink-0 text-zinc-400">I want to send</span>
                <span
                  className="pb-0.5 text-xl tabular-nums sm:text-2xl"
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
                  className="w-[7.5rem] border-0 border-b border-zinc-600 bg-transparent pb-0.5 text-xl font-semibold tabular-nums text-zinc-100 outline-none transition placeholder:text-zinc-400 focus:border-[#14F195]/70 disabled:opacity-50 sm:w-40 sm:text-2xl md:w-48"
                />
                <span className="pb-0.5 text-zinc-400">as</span>
                <label className="relative inline-flex items-center pb-0.5">
                  <select
                    value={sendRefCurrency}
                    aria-label="Reference currency"
                    onChange={(e) => {
                      setSendRefCurrency(e.target.value as SendRefCurrency);
                      setSendAmount("");
                    }}
                    disabled={isSending}
                    className="min-h-14 min-w-[14rem] max-w-[min(100vw-2rem,24rem)] cursor-pointer appearance-none rounded-xl border border-white/15 bg-black/35 py-3.5 pl-3.5 pr-10 text-base font-medium text-zinc-100 outline-none transition hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[15rem]"
                  >
                    {smartSendDenomOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 sm:h-[1.125rem] sm:w-[1.125rem]"
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

              <p className="min-h-[1.5rem] text-base leading-snug text-zinc-400">
                {smartSend.kind === "ok" && smartSend.lamports != null ? (
                  smartSendFeePreview ? (
                    <>
                      <span className="block">
                        Total debited from vault:{" "}
                        <span className="font-mono font-medium text-zinc-200">
                          {formatExecutedSol(smartSendFeePreview.gross)}
                        </span>{" "}
                        SOL.
                      </span>
                      <span className="mt-1.5 block">
                        Recipient receives{" "}
                        <span className="font-mono text-lg font-medium text-zinc-100">
                          {formatExecutedSol(sol(smartSendFeePreview.net))}
                        </span>{" "}
                        SOL; protocol fee (
                        {protocolSendFeePercentLabel()}):{" "}
                        <span className="font-mono font-medium text-zinc-300">
                          {formatExecutedSol(sol(smartSendFeePreview.fee))}
                        </span>{" "}
                        SOL.
                      </span>
                    </>
                  ) : (
                    <>
                      The recipient will receive exactly{" "}
                      <span className="font-mono text-lg font-medium text-zinc-100">
                        {formatExecutedSol(smartSend.lamports)}
                      </span>{" "}
                      SOL.
                    </>
                  )
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
                      className="rounded-full border border-white/10 bg-black/35 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-zinc-300 transition hover:border-blue-400/35 hover:bg-blue-500/10 hover:text-blue-100 disabled:opacity-50"
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
                      className="rounded-full border border-white/10 bg-black/35 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-zinc-300 transition hover:border-[#14F195]/35 hover:bg-[#14F195]/10 hover:text-[#14F195] disabled:opacity-50"
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
                      className="rounded-full border border-white/10 bg-black/35 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-zinc-300 transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
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
                      className="rounded-full border border-white/10 bg-black/35 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-zinc-300 transition hover:border-teal-400/35 hover:bg-teal-500/10 hover:text-teal-200 disabled:opacity-50"
                    >
                      {pesos}&nbsp;MXN
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
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

              <div className="min-w-0 flex-1 text-sm text-zinc-400">
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

        {vaultAddress && (vaultLamports ?? 0n) > 0n && (
          <div className="flex flex-col items-center gap-1.5 px-2 pb-2 pt-4 text-center text-[10px] text-zinc-400">
            <span className="font-medium">Vault PDA</span>
            <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
              <a
                href={getExplorerUrl(`/address/${vaultAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open in Solana Explorer (${cluster})`}
                className="max-w-full break-all font-mono text-[10px] text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300"
              >
                {vaultAddress}
              </a>
              <button
                type="button"
                onClick={handleCopyVaultAddress}
                className="shrink-0 rounded p-0.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-300"
                aria-label="Copy vault address"
              >
                <Copy className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </section>
    </PremiumShell>
  );
}

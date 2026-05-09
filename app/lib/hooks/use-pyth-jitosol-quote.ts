"use client";

import useSWR from "swr";
import { fetchJitosolSolQuote } from "../pyth/prices";

const POLL_MS = 2000;

export function usePythJitosolQuote() {
  return useSWR("pyth-jitosol-sol-btc-xlm", fetchJitosolSolQuote, {
    refreshInterval: POLL_MS,
    revalidateOnFocus: false,
    dedupingInterval: 1500,
  });
}

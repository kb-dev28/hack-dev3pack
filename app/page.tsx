"use client";

import { VaultCard } from "./components/vault-card";
import { GridBackground } from "./components/grid-background";
import { ThemeToggle } from "./components/theme-toggle";
import { ClusterSelect } from "./components/cluster-select";
import { WalletButton } from "./components/wallet-button";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />

      <div className="relative z-10">
        <header className="mx-auto flex max-w-6xl items-center justify-end px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <ClusterSelect />
            <WalletButton />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-12 pt-0 sm:px-6">
          <VaultCard />
        </main>
      </div>
    </div>
  );
}

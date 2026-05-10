"use client";

import { VaultCard } from "./components/vault-card";
import { GridBackground } from "./components/grid-background";
import { SiteChromeHeader } from "./components/site-chrome-header";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />

      <div className="relative z-10">
        <SiteChromeHeader />

        <main className="mx-auto max-w-6xl px-4 pb-12 pt-0 sm:px-6">
          <VaultCard />
        </main>
      </div>
    </div>
  );
}

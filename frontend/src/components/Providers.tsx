"use client";
import { useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { sdk } from "@farcaster/miniapp-sdk";

const queryClient = new QueryClient();

// Saat app dibuka sebagai Farcaster Mini App, host nampilin splash screen sampai
// kita panggil ready(). Kalau tidak dipanggil, user mentok di loading. Di luar
// Mini App (browser biasa) ini no-op aman (di-guard isInMiniApp + try/catch).
function MiniAppReady() {
  useEffect(() => {
    (async () => {
      try {
        if (await sdk.isInMiniApp()) await sdk.actions.ready();
      } catch {}
    })();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniAppReady />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

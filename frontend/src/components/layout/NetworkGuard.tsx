"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN } from "@/lib/contracts";

// Blocking banner shown when a connected wallet is on the wrong network.
// OriginPad contracts only exist on ACTIVE_CHAIN (Base Sepolia on testnet,
// Base on mainnet). Sending funds or transactions from any other chain is a
// dead-end (the address has no contract there), so we surface a clear prompt
// and a one-click switch instead of letting writes fire on the wrong chain.
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === ACTIVE_CHAIN.id) return null;

  return (
    <div className="w-full bg-danger/10 border-b border-danger/30 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 text-center flex-wrap">
        <span className="text-text-secondary">
          <span className="font-semibold text-danger">WRONG NETWORK.</span>{" "}
          OriginPad runs on <span className="font-semibold">{ACTIVE_CHAIN.name}</span>. Switch
          networks before sending any transaction, or your funds may be lost.
        </span>
        <button
          onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
          disabled={isPending}
          className="btn-danger-solid btn-sm flex-shrink-0"
        >
          {isPending ? "Switching..." : `Switch to ${ACTIVE_CHAIN.name}`}
        </button>
      </div>
    </div>
  );
}

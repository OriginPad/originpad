"use client";

import { useEffect, useState } from "react";
import { IS_TESTNET } from "@/lib/contracts";

// Slim, dismissible banner shown only on Base Sepolia so public testers know
// this is a testnet (no real funds) and where to get test ETH.
export function TestnetBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!IS_TESTNET) return;
    setHidden(localStorage.getItem("op_testnet_banner_dismissed") === "1");
  }, []);

  if (!IS_TESTNET || hidden) return null;

  const dismiss = () => {
    localStorage.setItem("op_testnet_banner_dismissed", "1");
    setHidden(true);
  };

  return (
    <div className="w-full bg-amber/10 border-b border-amber/30 text-[11px] sm:text-xs">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-center gap-3 text-center">
        <span className="text-text-secondary">
          <span className="font-semibold text-amber">TESTNET</span> on Base Sepolia. No real funds. Get free test ETH from the{" "}
          <a
            href="https://www.alchemy.com/faucets/base-sepolia"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber underline underline-offset-2 hover:opacity-80"
          >
            faucet
          </a>
          .{" "}
          <a href="/feedback" className="font-semibold text-amber underline underline-offset-2 hover:opacity-80">
            Send feedback
          </a>
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss testnet notice"
          className="text-text-dim hover:text-text-primary flex-shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { formatUnits } from "viem";
import Link from "next/link";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { TOKEN_ABI, CONTRACTS, FEE_HOOK_ABI, poolIdFor, IS_TESTNET } from "@/lib/contracts";
import { ClaimFees } from "@/components/token/ClaimFees";
import { VaultStatus } from "@/components/token/VaultStatus";
import { SwapBox } from "@/components/token/SwapBox";
import { IpfsImage } from "@/components/ui/IpfsImage";

export default function TokenPage() {
  const { address: tokenAddr } = useParams<{ address: string }>();
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null);
  const [creatorTwitter, setCreatorTwitter] = useState<string | null>(null);
  const [websiteURL, setWebsiteURL] = useState<string | null>(null);

  const { data: tokenInfo, isLoading } = useReadContract({
    address: tokenAddr as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: "getTokenInfo",
  });

  useEffect(() => {
    const nftCol = (tokenInfo as any)?.[5];
    if (!nftCol) return;
    const api = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";
    fetch(`${api}/api/collection/meta/${nftCol}`)
      .then(r => r.json())
      .then(d => { if (!d.error && d.websiteURL) setWebsiteURL(d.websiteURL); })
      .catch(() => {});
  }, [tokenInfo]);

  useEffect(() => {
    const creator_ = (tokenInfo as any)?.[4];
    if (!creator_) return;
    const api = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";
    fetch(`${api}/api/profile/${creator_}`)
      .then(r => r.json())
      .then(d => { if (!d.error && d.username) { setCreatorUsername(d.username); if (d.twitter) setCreatorTwitter(d.twitter); } })
      .catch(() => {});
  }, [tokenInfo]);

  const { data: feeBpsRaw } = useReadContract({
    address: CONTRACTS.feeHook,
    abi: FEE_HOOK_ABI,
    functionName: "poolFeeBps",
    args: [poolIdFor(tokenAddr as `0x${string}`)],
    query: { enabled: !!tokenAddr },
  });
  const feeBps = feeBpsRaw && (feeBpsRaw as bigint) > 0n ? Number(feeBpsRaw as bigint) : 150;
  const feePct = feeBps / 100;
  const splitPct = (bps: number) => `${((feePct * bps) / 150).toFixed(2)}%`;

  const { data: totalSupply } = useReadContract({
    address: tokenAddr as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: "totalSupply",
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-panel w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square bg-panel" />
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-panel" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenInfo) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-text-dim">Token not found</p>
      </div>
    );
  }

  const [name, symbol, image, bio, creator, nftCollection, deployedAt, vaultLocked] =
    tokenInfo;
  // A token on this page is already bonded, so its V4 pool is live and tradeable.
  const trading = true;

  const deployedDate = new Date(Number(deployedAt) * 1000);
  const supplyFormatted = totalSupply
    ? Number(formatUnits(totalSupply, 18)).toLocaleString()
    : "—";


  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Back to collection */}
      <Link
        href={`/collection/${nftCollection}`}
        className="text-xs font-medium text-text-dim hover:text-amber transition-colors mb-8 inline-block"
      >
        ← BACK TO NFT COLLECTION
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
        {/* Token image */}
        <div className="relative">
          <div className="aspect-[4/3] sm:aspect-square bg-surface border border-border rounded-2xl overflow-hidden">
            {image ? (
              <IpfsImage
                uri={image}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span
                  className="text-6xl text-amber/20"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {symbol[0]}
                </span>
              </div>
            )}

            {/* Mythic badge */}
            <div className="absolute top-4 left-4">
              <span className="badge border-mythic text-mythic bg-void/90 text-[10px]">
                ★ MYTHIC PHOTO
              </span>
            </div>
          </div>
          <ClaimFees token={tokenAddr as `0x${string}`} />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2rem,5vw,3rem)",
                  letterSpacing: "0.04em",
                }}
              >
                {name}
              </h1>
              <span className="badge border-amber/40 text-amber">${symbol}</span>
            </div>
            <p className="font-body text-sm text-text-secondary leading-relaxed">{bio}</p>
          </div>

          {/* Market links. On testnet only the (sepolia) explorer works; the
              DEX aggregators do not index Base Sepolia, so they are hidden. */}
          <div className="flex gap-2 flex-wrap">
            {(IS_TESTNET
              ? [{ label: "Basescan", url: `https://sepolia.basescan.org/token/${tokenAddr}` }]
              : [
                  { label: "Dexscreener", url: `https://dexscreener.com/base/${tokenAddr}` },
                  { label: "Basescan", url: `https://basescan.org/token/${tokenAddr}` },
                  { label: "Matcha", url: `https://matcha.xyz/tokens/base/${tokenAddr}` },
                  { label: "Bubblemaps", url: `https://app.bubblemaps.io/base/token/${tokenAddr}` },
                ]
            ).map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 bg-surface border border-border rounded-full hover:border-amber/60 text-xs font-medium text-text-secondary hover:text-amber transition-colors">
                {link.label} ↗
              </a>
            ))}
          </div>

          {/* Social links */}
          <div className="flex gap-4 flex-wrap">
            {(tokenInfo as any)?.socialX && (
              <a
                href={`https://x.com/${(tokenInfo as any).socialX.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-text-dim hover:text-amber transition-colors"
              >
                X ↗
              </a>
            )}
            {(tokenInfo as any)?.socialGithub && (
              <a
                href={`https://github.com/${(tokenInfo as any).socialGithub}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-text-dim hover:text-amber transition-colors"
              >
                GitHub ↗
              </a>
            )}
            {(tokenInfo as any)?.socialFarcaster && (
              <a
                href={`https://warpcast.com/${(tokenInfo as any).socialFarcaster.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-text-dim hover:text-amber transition-colors"
              >
                Farcaster ↗
              </a>
            )}
            {websiteURL && (
              <a
                href={websiteURL}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-text-dim hover:text-amber transition-colors"
              >
                Website ↗
              </a>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "TOTAL SUPPLY", value: supplyFormatted },
              { label: "DEPLOYED", value: deployedDate.toLocaleDateString() },
              { label: "TRADING", value: trading ? "LIVE" : "NOT YET" },
              { label: "VAULT LOCKED", value: vaultLocked ? "YES" : "PENDING 24H" },
              {
                label: "CONTRACT",
                value: `${tokenAddr.slice(0, 6)}…${tokenAddr.slice(-4)}`,
              },
              {
                label: "CREATOR",
                value: creatorUsername || `${(creator as string).slice(0, 6)}…${(creator as string).slice(-4)}`,
                twitter: creatorTwitter,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface border border-border rounded-xl p-3">
                <p className="text-[10px] font-medium text-text-dim uppercase tracking-wide mb-1">
                  {stat.label}
                </p>
                {(stat as any).twitter ? (
                  <a
                    href={`https://twitter.com/${(stat as any).twitter.replace("@","")}`}
                    target="_blank" rel="noreferrer"
                    className="font-mono text-sm text-amber hover:underline"
                  >
                    {stat.value}
                  </a>
                ) : (
                <p
                  className={`font-mono text-sm ${
                    stat.label === "TRADING" && trading
                      ? "text-green-400"
                      : "text-text-primary"
                  }`}
                >
                  {stat.value}
                </p>
                )}
              </div>
            ))}
          </div>

          {/* Vault lock CTA */}
          {!vaultLocked && (
            <VaultLockButton
              tokenAddress={tokenAddr as `0x${string}`}
              deployedAt={Number(deployedAt)}
            />
          )}


        </div>
      </div>

      {/* Price chart (mainnet only) + buy/sell widget. DexScreener does not
          index Base Sepolia, so on testnet we skip the chart and lead with the
          in-app swap box. */}
      {trading && (
        <div className="card mt-8">
          <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-4">
            {IS_TESTNET ? "TRADE" : "PRICE CHART"}
          </p>
          {IS_TESTNET ? (
            <p className="text-xs text-text-secondary mb-4">
              Live on Base Sepolia testnet. External charts (DexScreener) only index mainnet,
              so trade directly below via the in-app Uniswap V4 pool.
            </p>
          ) : (
            <div className="overflow-hidden border border-border rounded-xl" style={{height:"420px"}}>
              <iframe
                src={`https://dexscreener.com/base/${tokenAddr}?embed=1&theme=light&trades=1&info=0`}
                className="w-full h-full"
                frameBorder="0"
                allow="clipboard-write"
              />
            </div>
          )}

          {/* In-app Buy / Sell box (Uniswap V4, no leaving the app) */}
          <div className={IS_TESTNET ? "" : "mt-4"}>
            <SwapBox token={tokenAddr as `0x${string}`} symbol={symbol} />
          </div>
        </div>
      )}

      {/* Vault status */}
      <VaultStatus tokenAddress={tokenAddr as `0x${string}`} />

      {/* Fee breakdown reminder */}
      <div className="card mt-8">
        <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-4">TOKEN ECONOMICS</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-text-dim mb-3">TRADING FEE ({feePct.toFixed(1)}% BUY + SELL)</p>
            <div className="space-y-1.5">
              {[
                { label: "Creator", value: splitPct(100), color: "#f59e0b" },
                { label: "Platform", value: splitPct(20), color: "#6b7280" },
                { label: "Airdrop vault", value: splitPct(10), color: "#22c55e" },
                { label: "Maintenance", value: splitPct(20), color: "#6b7280" },
              ].map((f) => (
                <div key={f.label} className="flex justify-between text-xs">
                  <span className="text-text-secondary">{f.label}</span>
                  <span className="font-mono" style={{ color: f.color }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-text-dim mb-3">VAULT ALLOCATION (50% LOCKED)</p>
            <div className="space-y-1.5">
              {[
                { label: "Airdrop (top 100 losers)", value: "5%", color: "#22c55e" },
                { label: "Burn (over 56 days)", value: "45%", color: "#ef4444" },
              ].map((f) => (
                <div key={f.label} className="flex justify-between text-xs">
                  <span className="text-text-secondary">{f.label}</span>
                  <span className="font-mono" style={{ color: f.color }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vault Lock Button ────────────────────────────────────────────────────────
function VaultLockButton({
  tokenAddress,
  deployedAt,
}: {
  tokenAddress: `0x${string}`;
  deployedAt: number;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const now = Math.floor(Date.now() / 1000);
  const canLock = now >= deployedAt + 86400;
  const unlockIn = deployedAt + 86400 - now;
  const hrs = Math.floor(unlockIn / 3600);
  const mins = Math.floor((unlockIn % 3600) / 60);

  const handleLock = async () => {
    try {
      toast.loading("Locking vault...", { id: "vault" });
      await writeContractAsync({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: "lockVault",
      });
      toast.success("Vault locked! 50% supply secured.", { id: "vault" });
    } catch (err: any) {
      toast.error(err?.shortMessage || "Lock failed", { id: "vault" });
    }
  };

  if (!canLock) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs font-medium text-text-dim mb-1">VAULT LOCKS IN</p>
        <p
          className="text-2xl text-amber"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}
        >
          {hrs}h {mins}m
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleLock}
      disabled={isPending}
      className="btn-primary"
    >
      {isPending ? "LOCKING..." : "LOCK VAULT NOW (24H PASSED)"}
    </button>
  );
}

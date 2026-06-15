"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, VAULT_ABI } from "@/lib/contracts";
import {
  checkEligibility, EPOCH_DAYS, formatEpochDate, epochCountdown,
  type EligibilityResult,
} from "@/lib/airdrop";

const ERC20_MIN = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

interface TokenAirdrop {
  token: `0x${string}`;
  name: string;
  symbol: string;
  vaultBalance: bigint;
  epochAllocation: bigint; // 1% of supply
  epochTimes: bigint[];
  executed: bigint[];
  ready: boolean[];
  eligibility?: EligibilityResult;
}

function compactToken(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export default function AirdropsPage() {
  const client = usePublicClient();
  const { address } = useAccount();
  const [items, setItems] = useState<TokenAirdrop[]>([]);
  const [loading, setLoading] = useState(true);

  // Community airdrop stats (daily worth + lifetime), served by the profile API
  const STATS_API = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";
  const [stats, setStats] = useState<{ date: string; day: { eth: number; usd: number }; lifetimeUsd: number } | null>(null);
  const [selDate, setSelDate] = useState("");
  useEffect(() => {
    const q = selDate ? `?date=${selDate}` : "";
    fetch(`${STATS_API}/api/airdrop/stats${q}`).then((r) => r.json()).then(setStats).catch(() => {});
  }, [selDate]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const tokens = (await client.readContract({
          address: CONTRACTS.vault,
          abi: VAULT_ABI,
          functionName: "getManagedTokens",
        })) as `0x${string}`[];

        const rows: TokenAirdrop[] = [];
        for (const token of tokens) {
          const [status, name, symbol, supply] = await Promise.all([
            client.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "getVaultStatus", args: [token] }),
            client.readContract({ address: token, abi: ERC20_MIN, functionName: "name" }).catch(() => "Token"),
            client.readContract({ address: token, abi: ERC20_MIN, functionName: "symbol" }).catch(() => "TKN"),
            client.readContract({ address: token, abi: ERC20_MIN, functionName: "totalSupply" }).catch(() => BigInt(0)),
          ]);
          const [balance, executed, epochTimes, ready] = status as [bigint, bigint[], bigint[], boolean[]];

          let eligibility: EligibilityResult | undefined;
          if (address) eligibility = await checkEligibility(token, address);

          rows.push({
            token,
            name: name as string,
            symbol: symbol as string,
            vaultBalance: balance,
            epochAllocation: (supply as bigint) / BigInt(100), // 1%
            epochTimes: epochTimes as bigint[],
            executed: executed as bigint[],
            ready: ready as boolean[],
            eligibility,
          });
        }
        if (!cancelled) setItems(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [client, address]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
      <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-2">Airdrops</p>
      <h1 className="text-2xl font-bold mb-2">Loser airdrop schedule</h1>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed max-w-2xl">
        Every locked token burns 9% and airdrops 1% of supply to its top 100 trading losers across
        5 epochs (day 1, 7, 14, 28, 56). Losers are ranked by combined ETH loss across the NFT
        marketplace and the token pool. The list is frozen at 23:30 UTC and paid out at 00:00 UTC.
        Connect your wallet to see if you qualify.
      </p>

      {/* Community airdrop stats */}
      {stats && (
        <div className="card rounded-2xl border border-border p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide">Airdrop this day</p>
              <input
                type="date"
                value={selDate || stats.date}
                onChange={(e) => setSelDate(e.target.value)}
                className="text-[11px] bg-bg-secondary border border-border rounded-lg px-2 py-1 text-text-secondary focus:outline-none focus:border-amber"
              />
            </div>
            <p className="text-2xl font-bold text-text-primary">{stats.day.eth.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-base text-text-secondary">ETH</span></p>
            <p className="text-xs text-text-secondary mt-0.5">~${stats.day.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} worth · {stats.date}</p>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-5">
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide mb-1">Total airdrop to community (lifetime)</p>
            <p className="text-2xl font-bold text-amber">${stats.lifetimeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-text-secondary mt-0.5">distributed to traders since launch</p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link href="/marketplace" className="text-xs font-semibold text-amber hover:underline">
          Back to Market
        </Link>
        <span className="text-text-secondary text-xs"> · </span>
        <Link href="/landing/docs#airdrops" className="text-xs font-semibold text-amber hover:underline">
          How eligibility works
        </Link>
      </div>

      {loading && (
        <div className="text-sm text-text-secondary py-12 text-center">Loading airdrops...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="card rounded-2xl border border-border p-8 text-center">
          <p className="text-sm font-semibold mb-1">No airdrops scheduled yet</p>
          <p className="text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
            An airdrop schedule appears here once a bonded token locks its vault. That happens 24
            hours after the token deploys, when anyone calls lockVault on the token page.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.token} className="card rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <Link href={`/token/${it.token}`} className="text-base font-bold hover:text-amber">
                  {it.name} <span className="text-text-secondary font-mono text-sm">${it.symbol}</span>
                </Link>
                <p className="text-xs text-text-secondary mt-0.5">
                  Vault holds {compactToken(it.vaultBalance)} · {compactToken(it.epochAllocation)} {it.symbol} per epoch
                </p>
              </div>
              {it.eligibility?.eligible ? (
                <div className="text-right shrink-0">
                  <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-green-600 bg-green-50 rounded-full">
                    ELIGIBLE · RANK #{it.eligibility.rank}
                  </span>
                  <p className="text-xs text-text-secondary mt-1">
                    est {compactToken(BigInt(it.eligibility.amount))} {it.symbol}/epoch
                  </p>
                </div>
              ) : address ? (
                <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-text-secondary bg-bg-secondary rounded-full shrink-0">
                  NOT IN TOP 100
                </span>
              ) : null}
            </div>

            {/* Epoch timeline */}
            <div className="grid grid-cols-5 gap-2">
              {EPOCH_DAYS.map((day, i) => {
                const done = it.executed[i] && it.executed[i] !== BigInt(0);
                const isReady = it.ready[i];
                return (
                  <div
                    key={day}
                    className={`rounded-xl border p-2.5 text-center
                      ${done ? "border-green-200 bg-green-50" : isReady ? "border-amber/40 bg-amber/5" : "border-border bg-bg-secondary"}`}
                  >
                    <p className="text-[10px] font-bold text-text-secondary">DAY {day}</p>
                    <p className="text-[10px] text-text-secondary mt-1">{formatEpochDate(it.epochTimes[i])}</p>
                    <p className={`text-[10px] font-semibold mt-1
                      ${done ? "text-green-600" : isReady ? "text-amber" : "text-text-secondary"}`}>
                      {done ? "done" : isReady ? "ready" : epochCountdown(it.epochTimes[i])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

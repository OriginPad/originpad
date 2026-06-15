"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePublicClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useRecentCollections } from "@/hooks/useCollections";
import { NFT_ABI, LAUNCHPAD_ABI, CONTRACTS } from "@/lib/contracts";
import { IpfsImage } from "@/components/ui/IpfsImage";
import { fetchProfiles, type Identity } from "@/lib/profiles";
import { IdentityCell } from "@/components/ui/IdentityCell";

type LBTab = "collections" | "creators" | "traders" | "holders";

interface CollectionEntry {
  address: string;
  name: string;
  ticker: string;
  photo: string;
  minted: number;
  bonded: boolean;
  creator: string;
  volume: bigint;
}

interface CreatorEntry {
  address: string;
  collections: number;
  totalMinted: number;
  bonded: number;
  volume: bigint;
}

interface TraderEntry {
  address: string;
  buys: number;
  sells: number;
  volume: bigint;
}

function shortAddr(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

export default function LeaderboardPage() {
  const [tab, setTab] = useState<LBTab>("collections");
  const { collections, isLoading } = useRecentCollections();
  const client = usePublicClient();

  const [collectionEntries, setCollectionEntries] = useState<CollectionEntry[]>([]);
  const [creatorEntries, setCreatorEntries] = useState<CreatorEntry[]>([]);
  const [traderEntries, setTraderEntries] = useState<TraderEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Identity>>({});
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!collections.length || !client) return;
    setLoadingData(true);

    const compute = async () => {
      // Build collection entries sorted by minted desc
      const cols: CollectionEntry[] = collections.map(c => ({
        address: c.address,
        name: c.name,
        ticker: c.ticker,
        photo: c.coverPhoto,
        minted: c.minted,
        bonded: c.bonded,
        creator: c.creator,
        volume: BigInt(0),
      }));
      // Trader leaderboard + per-collection volume — index NFTSold events
      const traderMap = new Map<string, { buys: number; sells: number; volume: bigint }>();
      const colVolume = new Map<string, bigint>();
      const fromBlock = BigInt(Math.max(0, Number(await client.getBlockNumber()) - 45000));

      await Promise.allSettled(
        collections.filter(c => c.bonded).map(async (col) => {
          try {
            const logs = await client.getLogs({
              address: col.address as `0x${string}`,
              event: {
                type: "event",
                name: "NFTSold",
                inputs: [
                  { name: "tokenId", type: "uint256", indexed: true },
                  { name: "price", type: "uint256", indexed: false },
                  { name: "from", type: "address", indexed: false },
                  { name: "to", type: "address", indexed: false },
                ],
              },
              fromBlock,
            });
            for (const log of logs) {
              const { price, from, to } = (log as any).args;
              const colKey = col.address.toLowerCase();
              colVolume.set(colKey, (colVolume.get(colKey) || BigInt(0)) + (price as bigint));
              const buyerKey = (to as string).toLowerCase();
              const sellerKey = (from as string).toLowerCase();
              const bp = traderMap.get(buyerKey) || { buys: 0, sells: 0, volume: BigInt(0) };
              traderMap.set(buyerKey, { ...bp, buys: bp.buys + 1, volume: bp.volume + (price as bigint) });
              const sp = traderMap.get(sellerKey) || { buys: 0, sells: 0, volume: BigInt(0) };
              traderMap.set(sellerKey, { ...sp, sells: sp.sells + 1, volume: sp.volume + (price as bigint) });
            }
          } catch {}
        })
      );

      for (const c of cols) {
        c.volume = colVolume.get(c.address.toLowerCase()) || BigInt(0);
      }
      cols.sort((a, b) => b.minted - a.minted);
      setCollectionEntries(cols);

      // Creator leaderboard — ranked by trade volume across their collections
      const creatorMap = new Map<string, { collections: number; totalMinted: number; bonded: number; volume: bigint }>();
      for (const c of collections) {
        const key = c.creator.toLowerCase();
        const prev = creatorMap.get(key) || { collections: 0, totalMinted: 0, bonded: 0, volume: BigInt(0) };
        creatorMap.set(key, {
          collections: prev.collections + 1,
          totalMinted: prev.totalMinted + c.minted,
          bonded: prev.bonded + (c.bonded ? 1 : 0),
          volume: prev.volume + (colVolume.get(c.address.toLowerCase()) || BigInt(0)),
        });
      }
      const creators: CreatorEntry[] = Array.from(creatorMap.entries()).map(([addr, data]) => ({ address: addr, ...data }));
      creators.sort((a, b) =>
        (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0) ||
        b.bonded - a.bonded ||
        b.totalMinted - a.totalMinted
      );
      setCreatorEntries(creators);

      const traders: TraderEntry[] = Array.from(traderMap.entries())
        .map(([addr, data]) => ({ address: addr, ...data }))
        .sort((a, b) => (b.volume > a.volume ? 1 : -1));
      setTraderEntries(traders.slice(0, 50));

      // Resolve usernames + X handles for every address shown
      const addrs = [
        ...creators.map((c) => c.address),
        ...traders.slice(0, 50).map((t) => t.address),
        ...collections.map((c) => c.creator),
      ];
      fetchProfiles(addrs).then(setProfiles).catch(() => {});

      setLoadingData(false);
    };

    compute();
  }, [collections, client]);

  const tabs: { id: LBTab; label: string }[] = [
    { id: "collections", label: "Collections" },
    { id: "creators", label: "Creators" },
    { id: "traders", label: "Traders" },
    { id: "holders", label: "Holders" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 pb-24">
      <div className="mb-8">
        <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-1">LEADERBOARD</p>
        <h1 className="text-3xl font-bold text-text-primary">Rankings</h1>
        <p className="text-sm text-text-secondary mt-1">Top collections, creators, and traders on ORIGINPAD</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-8">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id ? "border-amber text-amber" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Collections */}
      {tab === "collections" && (
        isLoading || loadingData ? <LoadingSkeleton /> :
        collectionEntries.length === 0 ? <EmptyState /> :
        <div className="space-y-2">
          {collectionEntries.map((col, i) => (
            <motion.div key={col.address} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <Link href={`/collection/${col.address}`}>
                <div className="flex items-center gap-4 px-4 py-3 border border-border rounded-xl hover:border-amber/40 bg-surface transition-colors group">
                  <span className="font-mono text-xs text-text-dim w-6 text-right flex-shrink-0">{i + 1}</span>
                  {col.photo ? (
                    <IpfsImage uri={col.photo} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt={col.name} />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center">
                      <span className="text-amber/30 text-sm">?</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-primary group-hover:text-amber transition-colors truncate">{col.name}</p>
                    <p className="text-xs text-text-dim truncate">
                      ${col.ticker} · {profiles[col.creator.toLowerCase()]?.username || shortAddr(col.creator)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-text-dim">Minted</p>
                      <p className="font-mono text-sm font-bold text-amber">{col.minted}/100</p>
                    </div>
                    {col.bonded && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">BONDED</span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Creators */}
      {tab === "creators" && (
        isLoading || loadingData ? <LoadingSkeleton /> :
        creatorEntries.length === 0 ? <EmptyState /> :
        <div className="space-y-2">
          <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-medium text-text-dim uppercase tracking-wide border-b border-border">
            <span className="w-6" />
            <span className="flex-1">CREATOR</span>
            <span className="w-24 text-right hidden sm:block">COLLECTIONS</span>
            <span className="w-20 text-right">BONDED</span>
            <span className="w-24 text-right hidden sm:block">TOTAL MINTED</span>
            <span className="w-28 text-right">VOLUME</span>
          </div>
          {creatorEntries.slice(0, 50).map((c, i) => (
            <motion.div key={c.address} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <div className="flex items-center gap-4 px-4 py-3 border border-border rounded-xl hover:border-amber/40 bg-surface transition-colors">
                <span className="font-mono text-xs text-text-dim w-6 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <IdentityCell address={c.address} identity={profiles[c.address.toLowerCase()]} />
                </div>
                <span className="font-mono text-sm text-text-primary w-24 text-right hidden sm:block">{c.collections}</span>
                <span className="font-mono text-sm font-bold text-green-500 w-20 text-right">{c.bonded}</span>
                <span className="font-mono text-sm text-text-primary w-24 text-right hidden sm:block">{c.totalMinted}</span>
                <span className="font-mono text-sm font-bold text-amber w-28 text-right">{formatEther(c.volume).slice(0,8)} ETH</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Traders */}
      {tab === "traders" && (
        loadingData ? <LoadingSkeleton /> :
        traderEntries.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-lg font-semibold text-text-primary mb-2">No trades yet</p>
            <p className="text-sm text-text-secondary">Trades appear here after collections bond and NFTs trade on the marketplace</p>
          </div>
        ) :
        <div className="space-y-2">
          <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-medium text-text-dim uppercase tracking-wide border-b border-border">
            <span className="w-6" />
            <span className="flex-1">TRADER</span>
            <span className="w-16 text-right">BUYS</span>
            <span className="w-16 text-right">SELLS</span>
            <span className="w-28 text-right">VOLUME</span>
          </div>
          {traderEntries.map((t, i) => (
            <motion.div key={t.address} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <div className="flex items-center gap-4 px-4 py-3 border border-border rounded-xl hover:border-amber/40 bg-surface transition-colors">
                <span className="font-mono text-xs text-text-dim w-6 text-right flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <IdentityCell address={t.address} identity={profiles[t.address.toLowerCase()]} />
                </div>
                <span className="font-mono text-sm text-green-500 w-16 text-right">{t.buys}</span>
                <span className="font-mono text-sm text-red-400 w-16 text-right">{t.sells}</span>
                <span className="font-mono text-sm font-bold text-amber w-28 text-right">{formatEther(t.volume).slice(0,8)} ETH</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Holders — top holders across all collections */}
      {tab === "holders" && (
        <HoldersTab collections={collections} isLoading={isLoading} />
      )}
    </div>
  );
}

function HoldersTab({ collections, isLoading }: { collections: any[]; isLoading: boolean }) {
  const client = usePublicClient();
  const [holders, setHolders] = useState<{ address: string; count: number; value: bigint }[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Identity>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collections.length || !client) return;
    setLoading(true);
    const compute = async () => {
      // Net holdings per holder per collection: +1 on mint, ±1 on marketplace sale
      const holdings = new Map<string, Map<string, number>>();
      const bump = (holder: string, colKey: string, delta: number) => {
        const h = holder.toLowerCase();
        const m = holdings.get(h) || new Map<string, number>();
        m.set(colKey, (m.get(colKey) || 0) + delta);
        holdings.set(h, m);
      };
      // Valuation per NFT: marketplace floor when bonded & listed, else mint price
      const colPrice = new Map<string, bigint>();
      const fromBlock = BigInt(Math.max(0, Number(await client.getBlockNumber()) - 45000));

      await Promise.allSettled(
        collections.map(async (col) => {
          const colKey = col.address.toLowerCase();
          try {
            const mintLogs = await client.getLogs({
              address: col.address as `0x${string}`,
              event: { type: "event", name: "NFTMinted", inputs: [{ name: "minter", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: false }, { name: "rarity", type: "uint8", indexed: false }, { name: "price", type: "uint256", indexed: false }] },
              fromBlock,
            });
            for (const log of mintLogs) {
              bump((log as any).args.minter as string, colKey, 1);
            }

            if (col.bonded) {
              const soldLogs = await client.getLogs({
                address: col.address as `0x${string}`,
                event: { type: "event", name: "NFTSold", inputs: [{ name: "tokenId", type: "uint256", indexed: true }, { name: "price", type: "uint256", indexed: false }, { name: "from", type: "address", indexed: false }, { name: "to", type: "address", indexed: false }] },
                fromBlock,
              }).catch(() => []);
              for (const log of soldLogs) {
                const { from, to } = (log as any).args;
                bump(from as string, colKey, -1);
                bump(to as string, colKey, 1);
              }
            }

            let price = BigInt(0);
            try { price = parseEther(col.mintPrice || "0"); } catch {}
            if (col.bonded) {
              const prices = await Promise.all(
                Array.from({ length: 100 }, (_, i) =>
                  client.readContract({ address: col.address as `0x${string}`, abi: NFT_ABI, functionName: "tokenListPrice", args: [BigInt(i + 1)] })
                    .then(p => p as bigint)
                    .catch(() => BigInt(0))
                )
              );
              const listed = prices.filter(p => p > BigInt(0));
              if (listed.length > 0) {
                price = listed.reduce((min, p) => (p < min ? p : min), listed[0]);
              }
            }
            colPrice.set(colKey, price);
          } catch {}
        })
      );

      const sorted = Array.from(holdings.entries())
        .map(([address, perCol]) => {
          let count = 0;
          let value = BigInt(0);
          for (const [colKey, n] of Array.from(perCol.entries())) {
            if (n <= 0) continue;
            count += n;
            value += BigInt(n) * (colPrice.get(colKey) || BigInt(0));
          }
          return { address, count, value };
        })
        .filter(h => h.count > 0)
        .sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : b.count - a.count))
        .slice(0, 100);
      setHolders(sorted);
      fetchProfiles(sorted.map((h) => h.address)).then(setProfiles).catch(() => {});
      setLoading(false);
    };
    compute();
  }, [collections, client]);

  if (isLoading || loading) return <LoadingSkeleton />;
  if (!holders.length) return <EmptyState />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-medium text-text-dim uppercase tracking-wide border-b border-border">
        <span className="w-6" />
        <span className="flex-1">HOLDER</span>
        <span className="w-16 text-right">NFTS</span>
        <span className="w-28 text-right">EST. VALUE</span>
      </div>
      {holders.map((h, i) => (
        <motion.div key={h.address} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
          <div className="flex items-center gap-4 px-4 py-3 border border-border rounded-xl hover:border-amber/40 bg-surface transition-colors">
            <span className="font-mono text-xs text-text-dim w-6 text-right flex-shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <IdentityCell address={h.address} identity={profiles[h.address.toLowerCase()]} />
            </div>
            <span className="font-mono text-sm text-text-primary w-16 text-right">{h.count}</span>
            <span className="font-mono text-sm font-bold text-amber w-28 text-right">{formatEther(h.value).slice(0,8)} ETH</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-surface border border-border rounded-xl animate-pulse" />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card text-center py-16">
      <p className="text-lg font-semibold text-text-primary mb-2">No data yet</p>
      <p className="text-sm text-text-secondary">Rankings will appear as the platform grows</p>
    </div>
  );
}

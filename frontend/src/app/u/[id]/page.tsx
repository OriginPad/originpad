"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatEther } from "viem";
import Link from "next/link";
import { NFT_ABI } from "@/lib/contracts";
import { useRecentCollections } from "@/hooks/useCollections";
import { IpfsImage } from "@/components/ui/IpfsImage";
import { twitterLink, shortAddr, type Identity } from "@/lib/profiles";

const API = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";

type Profile = Identity & { address: string };
type Holding = { address: string; name: string; cover: string; balance: number };
type ActType = "mint" | "buy" | "sell" | "send" | "receive" | "token_out" | "token_in";
type Activity = { type: ActType; collection: string; name: string; cover: string; tokenId?: number; price?: bigint; amount?: string; symbol?: string; block: number };

const ACT_LABEL: Record<ActType, string> = {
  mint: "Minted", buy: "Bought", sell: "Sold", send: "Sent NFT", receive: "Received NFT", token_out: "Sent token", token_in: "Received token",
};
const ACT_COLOR: Record<ActType, string> = {
  mint: "text-text-dim", buy: "text-green-500", receive: "text-green-500", token_in: "text-green-500",
  sell: "text-red-400", send: "text-red-400", token_out: "text-red-400",
};

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const client = usePublicClient();
  const { collections } = useRecentCollections();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [resolvedAddr, setResolvedAddr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve id (address or username) to a profile + address
  useEffect(() => {
    if (!id) return;
    const isAddr = /^0x[a-fA-F0-9]{40}$/.test(id);
    const url = isAddr ? `${API}/api/profile/${id}` : `${API}/api/profile/by/${id}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) { setProfile(d); setResolvedAddr(d.address); }
        else if (isAddr) { setProfile(null); setResolvedAddr(id); } // address with no profile yet
        else setNotFound(true);
      })
      .catch(() => { if (isAddr) setResolvedAddr(id); else setNotFound(true); });
  }, [id]);

  // Load balance, holdings, activity once we have an address
  useEffect(() => {
    if (!client || !resolvedAddr || !collections.length) return;
    let on = true;
    (async () => {
      setLoading(true);
      try {
        const bal = await client.getBalance({ address: resolvedAddr as `0x${string}` });
        if (on) setEthBalance(bal);

        const latest = Number(await client.getBlockNumber());
        const fromBlock = BigInt(Math.max(0, latest - 45000));
        const owner = resolvedAddr.toLowerCase();

        const held: Holding[] = [];
        const acts: Activity[] = [];

        await Promise.allSettled(
          collections.map(async (c: any) => {
            const addr = c.address as `0x${string}`;
            try {
              const bal = await client.readContract({ address: addr, abi: NFT_ABI, functionName: "balanceOf", args: [resolvedAddr as `0x${string}`] });
              if (Number(bal) > 0) held.push({ address: c.address, name: c.name, cover: c.coverPhoto, balance: Number(bal) });
            } catch {}
            // Activity: mints + sales + plain NFT transfers (send/receive)
            try {
              const [mintLogs, soldLogs, nftOut, nftIn] = await Promise.all([
                client.getLogs({ address: addr, event: { type: "event", name: "NFTMinted", inputs: [{ name: "minter", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: false }, { name: "rarity", type: "uint8", indexed: false }, { name: "price", type: "uint256", indexed: false }] }, args: { minter: resolvedAddr as `0x${string}` }, fromBlock }).catch(() => []),
                client.getLogs({ address: addr, event: { type: "event", name: "NFTSold", inputs: [{ name: "tokenId", type: "uint256", indexed: true }, { name: "price", type: "uint256", indexed: false }, { name: "from", type: "address", indexed: false }, { name: "to", type: "address", indexed: false }] }, fromBlock }).catch(() => []),
                client.getLogs({ address: addr, event: { type: "event", name: "TransferSingle", inputs: [{ name: "operator", type: "address", indexed: true }, { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "id", type: "uint256", indexed: false }, { name: "value", type: "uint256", indexed: false }] }, args: { from: resolvedAddr as `0x${string}` }, fromBlock }).catch(() => []),
                client.getLogs({ address: addr, event: { type: "event", name: "TransferSingle", inputs: [{ name: "operator", type: "address", indexed: true }, { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "id", type: "uint256", indexed: false }, { name: "value", type: "uint256", indexed: false }] }, args: { to: resolvedAddr as `0x${string}` }, fromBlock }).catch(() => []),
              ]);
              const saleTxs = new Set((soldLogs as any[]).map((l) => l.transactionHash));
              for (const l of mintLogs as any[]) {
                acts.push({ type: "mint", collection: c.address, name: c.name, cover: c.coverPhoto, tokenId: Number(l.args?.tokenId), price: l.args?.price ?? BigInt(0), block: Number(l.blockNumber) });
              }
              for (const l of soldLogs as any[]) {
                const from = (l.args?.from || "").toLowerCase();
                const to = (l.args?.to || "").toLowerCase();
                if (from === owner) acts.push({ type: "sell", collection: c.address, name: c.name, cover: c.coverPhoto, tokenId: Number(l.args?.tokenId), price: l.args?.price ?? BigInt(0), block: Number(l.blockNumber) });
                else if (to === owner) acts.push({ type: "buy", collection: c.address, name: c.name, cover: c.coverPhoto, tokenId: Number(l.args?.tokenId), price: l.args?.price ?? BigInt(0), block: Number(l.blockNumber) });
              }
              const ZERO = "0x0000000000000000000000000000000000000000";
              // Plain sends: a transfer out that isn't a marketplace sale or a burn
              for (const l of nftOut as any[]) {
                if (saleTxs.has(l.transactionHash)) continue;
                if ((l.args?.to || "").toLowerCase() === ZERO) continue;
                acts.push({ type: "send", collection: c.address, name: c.name, cover: c.coverPhoto, tokenId: Number(l.args?.id), block: Number(l.blockNumber) });
              }
              // Plain receives: a transfer in that isn't a buy or a mint
              for (const l of nftIn as any[]) {
                if (saleTxs.has(l.transactionHash)) continue;
                if ((l.args?.from || "").toLowerCase() === ZERO) continue;
                acts.push({ type: "receive", collection: c.address, name: c.name, cover: c.coverPhoto, tokenId: Number(l.args?.id), block: Number(l.blockNumber) });
              }
            } catch {}

            // Token transfers (send/receive) for the deployed ERC-20, if bonded
            if (c.tokenAddress) {
              try {
                const tAddr = c.tokenAddress as `0x${string}`;
                const ev = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] } as const;
                const [tOut, tIn] = await Promise.all([
                  client.getLogs({ address: tAddr, event: ev, args: { from: resolvedAddr as `0x${string}` }, fromBlock }).catch(() => []),
                  client.getLogs({ address: tAddr, event: ev, args: { to: resolvedAddr as `0x${string}` }, fromBlock }).catch(() => []),
                ]);
                const ZERO = "0x0000000000000000000000000000000000000000";
                for (const l of tOut as any[]) {
                  if ((l.args?.to || "").toLowerCase() === ZERO) continue;
                  acts.push({ type: "token_out", collection: c.address, name: c.name, cover: c.coverPhoto, amount: formatEther(l.args?.value ?? BigInt(0)), symbol: c.ticker, block: Number(l.blockNumber) });
                }
                for (const l of tIn as any[]) {
                  if ((l.args?.from || "").toLowerCase() === ZERO) continue;
                  acts.push({ type: "token_in", collection: c.address, name: c.name, cover: c.coverPhoto, amount: formatEther(l.args?.value ?? BigInt(0)), symbol: c.ticker, block: Number(l.blockNumber) });
                }
              } catch {}
            }
          })
        );
        if (on) {
          setHoldings(held);
          setActivity(acts.sort((a, b) => b.block - a.block).slice(0, 30));
        }
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [client, resolvedAddr, collections]);

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Profile not found</h1>
        <p className="text-sm text-text-secondary mb-6">No user matches that name or address.</p>
        <Link href="/explore" className="btn-primary">Back to Explore</Link>
      </div>
    );
  }

  const x = twitterLink(profile?.twitter);
  const display = profile?.username || (resolvedAddr ? shortAddr(resolvedAddr) : "");
  const website = profile?.website || null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="card flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-surface border border-border flex-shrink-0">
          {profile?.avatar ? (
            <IpfsImage uri={profile.avatar} alt={display} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full gradient-bg flex items-center justify-center">
              <span className="text-white text-3xl font-bold">{(display[0] || "O").toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <h1 className="text-2xl font-bold text-text-primary truncate" style={{ fontFamily: "var(--font-display)" }}>{display}</h1>
          {resolvedAddr && <p className="font-mono text-xs text-text-dim mt-0.5">{shortAddr(resolvedAddr)}</p>}
          {profile?.bio && <p className="text-sm text-text-secondary mt-2 leading-relaxed">{profile.bio}</p>}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3">
            {website && (
              <a href={website} target="_blank" rel="noreferrer" className="text-xs font-medium text-text-dim hover:text-amber transition-colors">Website</a>
            )}
            {x && (
              <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-text-dim hover:text-amber transition-colors">
                X/@{x.handle}
                {(profile as any)?.twitterVerified && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="verified"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </a>
            )}
            <span className="text-xs font-medium text-text-dim">
              Balance: <span className="font-mono text-text-primary">{ethBalance != null ? parseFloat(formatEther(ethBalance)).toFixed(4) : "…"} ETH</span>
            </span>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold text-amber uppercase tracking-wide mb-3">NFTs held</h2>
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : holdings.length === 0 ? (
          <p className="text-sm text-text-dim">No NFTs held.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[28rem] overflow-y-auto pr-1">
            {holdings.map((h) => (
              <Link key={h.address} href={`/collection/${h.address}`} className="group">
                <div className="aspect-square rounded-xl overflow-hidden border border-border bg-surface">
                  <IpfsImage uri={h.cover} alt={h.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <p className="text-xs text-text-secondary mt-1 truncate">{h.name}</p>
                <p className="text-[10px] text-text-dim">×{h.balance}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold text-amber uppercase tracking-wide mb-3">Recent activity</h2>
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-text-dim">No recent activity.</p>
        ) : (
          <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
            {activity.map((a, i) => (
              <Link key={i} href={`/collection/${a.collection}`}
                className="flex items-center gap-3 px-3 py-2 border border-border rounded-lg bg-surface hover:border-amber/40 transition-colors">
                <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                  <IpfsImage uri={a.cover} alt={a.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {a.name}{a.tokenId !== undefined && <span className="text-text-dim"> #{a.tokenId}</span>}
                  </p>
                  <span className={`text-[10px] font-semibold uppercase ${ACT_COLOR[a.type]}`}>{ACT_LABEL[a.type]}</span>
                </div>
                {(a.type === "token_in" || a.type === "token_out")
                  ? <span className="font-mono text-xs text-text-secondary flex-shrink-0">{a.amount ? parseFloat(a.amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""} {a.symbol}</span>
                  : (a.price && a.price > BigInt(0)) ? <span className="font-mono text-xs text-text-secondary flex-shrink-0">{parseFloat(formatEther(a.price)).toFixed(4)} ETH</span> : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

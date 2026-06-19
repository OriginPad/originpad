"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { CollectionCard } from "@/components/collection/CollectionCard";
import { HeroCarousel } from "@/components/collection/HeroCarousel";
import { IpfsImage } from "@/components/ui/IpfsImage";
import { useRecentCollections } from "@/hooks/useCollections";
import { fetchProfiles, type Identity } from "@/lib/profiles";

type Tab = "nfts" | "tokens";
type Filter = "all" | "live" | "bonded" | "upcoming";
type Sort = "newest" | "cheapest" | "progress" | "activity";

const pill = (on: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
    on ? "bg-amber text-white border-amber" : "border-border text-text-secondary hover:border-amber hover:text-amber"
  }`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ExplorePage() {
  const { collections, isLoading } = useRecentCollections();
  const [tab, setTab] = useState<Tab>("nfts");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [search, setSearch] = useState("");
  const [identities, setIdentities] = useState<Record<string, Identity>>({});

  useEffect(() => {
    const addrs = collections.map((c) => c.creator).filter(Boolean);
    if (addrs.length) fetchProfiles(addrs).then(setIdentities).catch(() => {});
  }, [collections]);

  // Featured = most-minted active collections, for the swipeable hero
  const featured = useMemo(
    () => [...collections].filter((c) => c.minted > 0).sort((a, b) => b.minted - a.minted).slice(0, 6),
    [collections]
  );

  const filtered = useMemo(() => {
    let out = [...collections];
    if (filter === "live") out = out.filter((c) => c.mintOpen && !c.bonded);
    if (filter === "bonded") out = out.filter((c) => c.bonded);
    if (filter === "upcoming") out = out.filter((c) => !c.mintOpen && !c.bonded);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.bio.toLowerCase().includes(q)
      );
    }
    if (sort === "cheapest") out.sort((a, b) => Number(a.mintPrice) - Number(b.mintPrice)); // floor at top
    if (sort === "progress") out.sort((a, b) => b.minted - a.minted);
    if (sort === "activity")
      out.sort((a, b) => {
        if (a.mintOpen && !b.mintOpen) return -1;
        if (!a.mintOpen && b.mintOpen) return 1;
        return b.minted - a.minted;
      });
    return out;
  }, [collections, filter, sort, search]);

  const tokens = useMemo(
    () =>
      collections
        .filter((c) => c.bonded && c.tokenAddress)
        .filter(
          (c) =>
            !search.trim() ||
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.ticker.toLowerCase().includes(search.toLowerCase())
        ),
    [collections, search]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-1">EXPLORE</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">Marketplace</h1>
      </div>

      {/* Featured hero carousel (swipe) */}
      {!isLoading && featured.length > 0 && <HeroCarousel items={featured} identities={identities} />}

      {/* NFTs / Tokens tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {([["nfts", "NFTs"], ["tokens", "Tokens"]] as [Tab, string][]).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === v ? "border-amber text-amber" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {l}
            {v === "tokens" && tokens.length > 0 && <span className="ml-1.5 text-xs text-text-secondary">{tokens.length}</span>}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          className="input-base flex-1"
          placeholder="Search by name, ticker, bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {tab === "nfts" && (
          <>
            <div className="flex gap-2 flex-wrap">
              {(["all", "live", "bonded", "upcoming"] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={pill(filter === f)}>
                  {cap(f)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {([["newest", "Newest"], ["cheapest", "Cheapest"], ["progress", "Top"], ["activity", "Active"]] as [Sort, string][]).map(
                ([v, l]) => (
                  <button key={v} onClick={() => setSort(v)} className={pill(sort === v)}>
                    {l}
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {tab === "nfts" ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-20">
            <p className="text-xl font-semibold text-text-primary mb-2">Nothing found</p>
            <p className="text-sm text-text-secondary">{search ? `No results for "${search}"` : "No collections in this filter"}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary mb-4">
              {filtered.length} collection{filtered.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((col, i) => (
                <motion.div
                  key={col.address}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.4 }}
                >
                  <CollectionCard collection={col} />
                </motion.div>
              ))}
            </div>
          </>
        )
      ) : tokens.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-text-secondary">No live tokens yet. A token appears here once a collection bonds.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tokens.map((c) => (
            <a
              key={c.address}
              href={`/token/${c.tokenAddress}`}
              className="card hover:border-amber transition-colors flex items-center gap-3 p-4"
            >
              {c.coverPhoto && <IpfsImage uri={c.coverPhoto} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />}
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate">{c.name}</p>
                <p className="text-xs text-amber font-mono">${c.ticker}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

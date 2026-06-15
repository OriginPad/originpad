"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CollectionCard } from "@/components/collection/CollectionCard";
import { IpfsImage } from "@/components/ui/IpfsImage";
import { useRecentCollections } from "@/hooks/useCollections";

type Filter = "all" | "live" | "bonded" | "upcoming";
type Sort = "newest" | "progress" | "activity";

export default function ExplorePage() {
  const { collections, isLoading } = useRecentCollections();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let out = [...collections];

    // Filter
    if (filter === "live") out = out.filter((c) => c.mintOpen && !c.bonded);
    if (filter === "bonded") out = out.filter((c) => c.bonded);
    if (filter === "upcoming") out = out.filter((c) => !c.mintOpen && !c.bonded);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.ticker.toLowerCase().includes(q) ||
          c.bio.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "progress") out.sort((a, b) => b.minted - a.minted);
    if (sort === "activity") out.sort((a, b) => {
      if (a.mintOpen && !b.mintOpen) return -1;
      if (!a.mintOpen && b.mintOpen) return 1;
      return b.minted - a.minted;
    });

    return out;
  }, [collections, filter, sort, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-1">EXPLORE</p>
        <h1 className="text-4xl font-bold text-text-primary">All Collections</h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Search */}
        <div className="flex-1">
          <input
            className="input-base"
            placeholder="Search by name, ticker, bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "live", "bonded", "upcoming"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
                filter === f
                  ? "bg-amber text-white border-amber"
                  : "border-border text-text-secondary hover:border-amber hover:text-amber"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex gap-2 flex-wrap">
          {([["newest", "Newest"], ["progress", "Top"], ["activity", "Active"]] as [Sort, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSort(val as Sort)}
              className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
                sort === val
                  ? "bg-amber text-white border-amber"
                  : "border-border text-text-secondary hover:border-amber hover:text-amber"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Trending row */}
      {collections.filter(c => c.mintOpen && !c.bonded && c.minted > 0).length > 0 && filter === "all" && !search && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-3">TRENDING NOW</p>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {collections
              .filter(c => c.mintOpen && !c.bonded && c.minted > 0)
              .sort((a, b) => b.minted - a.minted)
              .slice(0, 5)
              .map(col => (
                <a key={col.address} href={`/collection/${col.address}`}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-xl hover:border-amber hover:shadow-sm transition-all">
                  {col.coverPhoto && (
                    <IpfsImage uri={col.coverPhoto} className="w-6 h-6 rounded-md object-cover" />
                  )}
                  <span className="text-sm font-medium text-text-primary whitespace-nowrap">{col.name}</span>
                  <span className="text-xs text-amber font-mono">{col.minted}/100</span>
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Count */}
      <p className="text-sm text-text-secondary mb-6">
        {filtered.length} collection{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-64" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-20">
          <p className="text-xl font-semibold text-text-primary mb-2">Nothing found</p>
          <p className="text-sm text-text-secondary">
            {search ? `No results for "${search}"` : "No collections in this filter"}
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}

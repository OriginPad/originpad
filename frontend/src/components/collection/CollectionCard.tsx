"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RARITY } from "@/lib/contracts";
import type { CollectionMeta } from "@/hooks/useCollections";
import { ipfsToHTTP } from "@/lib/ipfs";
import { IpfsImage } from "@/components/ui/IpfsImage";

function useDominantColor(src: string | null): string {
  const [color, setColor] = useState<string>("transparent");
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 10; canvas.height = 10;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 10, 10);
        const d = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
        const n = d.length / 4;
        setColor(`rgba(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)},0.12)`);
      } catch {}
    };
    img.src = src;
  }, [src]);
  return color;
}

function timeAgo(unix: number): string {
  if (!unix || unix <= 0) return "";
  const secs = Math.floor(Date.now() / 1000) - unix;
  if (secs < 0) return "";
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return `${Math.floor(secs / 604800)}w ago`;
}

// Compact live countdown ("2d 4h", "5h 12m", "12m 30s") until a unix time.
function CompactCountdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  const d = Math.max(0, target - now);
  const days = Math.floor(d / 86400);
  const hrs = Math.floor((d % 86400) / 3600);
  const mins = Math.floor((d % 3600) / 60);
  const secs = d % 60;
  const text = days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`;
  return <>{text}</>;
}

interface Props {
  collection: CollectionMeta;
}

const RARITY_LABEL = ["CMN", "UNC", "RARE", "EPIC", "LEG", "MYTH"];
const RARITY_COLOR = ["#6b7280", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"];

export function CollectionCard({ collection }: Props) {
  const router = useRouter();
  const bondingPct = Math.round((collection.minted / 100) * 100);
  const isBonded = collection.bonded;
  const isUpcoming = !isBonded && !collection.mintOpen && collection.startTime > 1000000 && collection.startTime * 1000 > Date.now();
  const photoURL = collection.coverPhoto ? ipfsToHTTP(collection.coverPhoto) : null;
  const dominantColor = useDominantColor(photoURL);

  return (
    <Link href={`/collection/${collection.address}`}>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        className="card hover:border-amber/40 cursor-pointer group h-full"
        style={{ background: dominantColor !== "transparent" ? `linear-gradient(135deg, ${dominantColor}, transparent 60%)` : undefined }}
      >
        {/* Cover photo */}
        <div className="relative -mx-6 -mt-6 mb-4 aspect-[4/3] overflow-hidden bg-surface">
          {collection.coverPhoto ? (
            <IpfsImage
              uri={collection.coverPhoto}
              alt={collection.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <img src="/landing/mystery.jpg" alt={collection.name} className="w-full h-full object-cover" />
          )}

          {/* Status chip (consistent rounded pill) */}
          {isBonded ? (
            <div className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 shadow-sm">
              BONDED
            </div>
          ) : collection.mintOpen ? (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm shadow-sm">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-green-600">MINTING</span>
            </div>
          ) : isUpcoming ? (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm shadow-sm">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span className="text-[10px] font-bold text-blue-600">
                IN <CompactCountdown target={collection.startTime} />
              </span>
            </div>
          ) : null}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-base text-text-primary group-hover:text-amber transition-colors leading-tight">
              {collection.name}
            </h3>
            <span className="text-xs text-text-secondary font-mono shrink-0">${collection.ticker}</span>
          </div>

          <p className="text-sm text-text-secondary line-clamp-2 mb-4 leading-relaxed">
            {collection.bio}
          </p>

          {/* Bonding bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-text-secondary mb-1.5">
              <span>BONDING</span>
              <span>{collection.minted}/100</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${bondingPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full ${isBonded ? "bg-amber" : "bg-amber"}`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div>
              <span className="text-xs text-text-secondary">
                {collection.mintPrice === "0" ? "FREE MINT" : `${collection.mintPrice} ETH`}
                {" + 0.0003 ETH"}
              </span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-text-dim">{collection.minted} holders</span>
                {collection.startTime > 0 && timeAgo(collection.startTime) && (
                  <span className="text-[10px] text-text-dim">· launched {timeAgo(collection.startTime)}</span>
                )}
              </div>
            </div>
            {collection.mintOpen && !isBonded ? (
              <button
                onClick={(e) => { e.preventDefault(); router.push(`/collection/${collection.address}`); }}
                className="btn-primary btn-sm"
              >
                MINT →
              </button>
            ) : collection.tokenAddress ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber/10 text-amber">
                TOKEN LIVE
              </span>
            ) : null}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

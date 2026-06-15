"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ProfilePanel } from "./ProfilePanel";
import { ProfileSetupModal } from "@/components/ui/ProfileSetupModal";
import { TermsModal } from "@/components/ui/TermsModal";
import { useProfile } from "@/hooks/useProfile";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { profile, needsSetup, updateProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(true); // assume accepted until we read localStorage (avoids SSR flash)
  useEffect(() => { setTosAccepted(localStorage.getItem("og_tos_accepted") === "1"); }, []);
  const shortAddr = address ? `${address.slice(0,6)}…${address.slice(-4)}` : null;

  // landing pages have their own chrome
  if (pathname.startsWith("/landing")) return null;

  return (
    <>
    <nav className="sticky top-0 z-50 border-b border-white/50 bg-white/60 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <a href="https://originpad.live" className="flex items-center group">
          <span className="text-xl font-bold tracking-tight text-void" style={{ fontFamily: "var(--font-display)" }}>ORIGIN<span className="text-amber">PAD</span></span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          <Link href="/explore" className="text-xs font-semibold text-text-secondary hover:text-amber">EXPLORE</Link>
          <Link href="/launch" className="text-xs font-semibold text-text-secondary hover:text-amber">LAUNCH</Link>
          <Link href="/marketplace" className="text-xs font-semibold text-text-secondary hover:text-amber">MARKET</Link>
          <Link href="/airdrops" className="text-xs font-semibold text-text-secondary hover:text-amber">AIRDROPS</Link>
          <Link href="/portfolio" className="text-xs font-semibold text-text-secondary hover:text-amber">PORTFOLIO</Link>
          <Link href="/support" className="text-xs font-semibold text-text-secondary hover:text-amber">SUPPORT</Link>
        </div>
        <div className="flex items-center gap-3">
          <form
            onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (v) { router.push(`/u/${v}`); setQ(""); } }}
            className="hidden sm:block"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user…"
              className="w-36 px-3 py-1.5 text-xs rounded-full border border-border bg-white/70 focus:outline-none focus:border-amber"
            />
          </form>
          {isConnected ? (
            <button onClick={() => setProfileOpen(true)} className="btn-primary btn-sm">{profile?.username || shortAddr}</button>
          ) : (
            <button onClick={() => setOpen(true)} className="btn-primary btn-sm">CONNECT</button>
          )}
        </div>
      </div>

      {open && !isConnected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-xl font-bold text-text-primary mb-6">Connect Wallet</p>
            <div className="flex flex-col gap-3">
              {connectors.map((c) => (
                <button key={c.uid} onClick={() => { connect({ connector: c }); setOpen(false); }} disabled={isPending}
                  className="w-full text-left px-4 py-3 border border-border rounded-xl hover:border-amber text-sm font-medium text-text-primary transition-colors">
                  {c.name}
                </button>
              ))}
            </div>
            <button onClick={() => setOpen(false)} className="mt-4 w-full text-xs font-semibold text-text-dim hover:text-amber">CLOSE</button>
          </div>
        </div>
      )}
    </nav>
    <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} onEdit={() => { setProfileOpen(false); setEditOpen(true); }} />
    {isConnected && !tosAccepted && (
      <TermsModal
        onAccept={() => { localStorage.setItem("og_tos_accepted", "1"); setTosAccepted(true); }}
        onDecline={() => { disconnect(); }}
      />
    )}
    {tosAccepted && needsSetup && address && (
      <ProfileSetupModal address={address} onComplete={updateProfile} />
    )}
    {editOpen && address && (
      <ProfileSetupModal
        address={address}
        editMode
        initialUsername={profile?.username || ""}
        initialTwitter={profile?.twitter || ""}
        initialTwitterVerified={profile?.twitterVerified || false}
        initialAvatar={profile?.avatar || ""}
        initialWebsite={profile?.website || ""}
        initialBio={profile?.bio || ""}
        onComplete={(p) => { updateProfile(p); setEditOpen(false); }}
        onClose={() => setEditOpen(false)}
      />
    )}
    </>
  );
}

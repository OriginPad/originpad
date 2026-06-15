"use client";

import { useState, useEffect, useRef } from "react";
import { useSignMessage } from "wagmi";
import { motion } from "framer-motion";
import { uploadToIPFS } from "@/lib/ipfs";
import { IpfsImage } from "./IpfsImage";
import { NftAvatarPicker } from "./NftAvatarPicker";

const API = process.env.NEXT_PUBLIC_PROFILE_API || "http://147.90.13.147:3001";

interface Props {
  address: string;
  onComplete: (profile: any) => void;
  // Edit mode: reopen the modal to change profile after first setup.
  editMode?: boolean;
  initialUsername?: string;
  initialTwitter?: string;
  initialTwitterVerified?: boolean;
  initialAvatar?: string;
  initialWebsite?: string;
  initialBio?: string;
  onClose?: () => void;
}

export function ProfileSetupModal({
  address, onComplete, editMode = false,
  initialUsername = "", initialTwitter = "", initialTwitterVerified = false,
  initialAvatar = "", initialWebsite = "", initialBio = "",
  onClose,
}: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [twitter, setTwitter] = useState(initialTwitter);
  const [twitterVerified, setTwitterVerified] = useState(initialTwitterVerified);
  const [xBusy, setXBusy] = useState(false);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [website, setWebsite] = useState(initialWebsite);
  const [bio, setBio] = useState(initialBio);
  const [avail, setAvail] = useState<"idle" | "checking" | "ok" | "taken">(editMode && initialUsername ? "ok" : "idle");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { signMessageAsync } = useSignMessage();

  // Connect X via verified OAuth popup (no typed handle = no impersonation)
  const connectX = async () => {
    setError("");
    setXBusy(true);
    try {
      const timestamp = Date.now();
      const signature = await signMessageAsync({
        message: `Connect X to OriginPad\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`,
      });
      const r = await fetch(`${API}/api/x/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, timestamp }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Could not start X login");

      const popup = window.open(d.url, "x_oauth", "width=600,height=720");
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type !== "x-result") return;
        window.removeEventListener("message", onMsg);
        setXBusy(false);
        if (ev.data.ok) {
          setTwitter(ev.data.username);
          setTwitterVerified(true);
        } else {
          setError("X connection failed: " + (ev.data.error || "unknown"));
        }
      };
      window.addEventListener("message", onMsg);
      // Fallback if the popup is closed without finishing
      const poll = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", onMsg);
          setXBusy(false);
        }
      }, 700);
    } catch (e: any) {
      setXBusy(false);
      const msg = e?.message || "";
      setError(/reject|denied|cancel/i.test(msg) ? "Signature cancelled" : (msg || "Failed to connect X"));
    }
  };

  const unlinkX = async () => {
    setError("");
    setXBusy(true);
    try {
      const timestamp = Date.now();
      const signature = await signMessageAsync({
        message: `Unlink X from OriginPad\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`,
      });
      const r = await fetch(`${API}/api/x/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, timestamp }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Unlink failed"); }
      setTwitter("");
      setTwitterVerified(false);
    } catch (e: any) {
      const msg = e?.message || "";
      setError(/reject|denied|cancel/i.test(msg) ? "Signature cancelled" : (msg || "Failed to unlink"));
    } finally {
      setXBusy(false);
    }
  };

  // Debounced availability check
  useEffect(() => {
    if (username.length < 3) { setAvail("idle"); return; }
    // Keeping your own current username is always fine (don't flag it as taken)
    if (username.toLowerCase() === initialUsername.toLowerCase()) { setAvail("ok"); return; }
    setAvail("checking");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/profile/check/${username}`);
        const d = await r.json();
        setAvail(d.available ? "ok" : "taken");
      } catch { setAvail("idle"); }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError("Image too large (max 5MB)"); return; }
    setUploading(true);
    setError("");
    try {
      const uri = await uploadToIPFS(f);
      setAvatar(uri);
    } catch {
      setError("Upload failed, try again");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (skip = false) => {
    setLoading(true);
    setError("");
    try {
      const timestamp = Date.now();
      const msgUsername = skip ? "random" : username.toLowerCase().trim();
      const message = `Sign to set OriginPad profile\nUsername: ${msgUsername}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });
      const r = await fetch(`${API}/api/profile/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          username: skip ? "" : username,
          twitter: skip ? "" : twitter,
          avatar: skip ? "" : avatar,
          website: skip ? "" : website,
          bio: skip ? "" : bio,
          signature,
          timestamp,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onComplete(data.profile);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
        setError("Signature cancelled");
      } else {
        setError(msg || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.length >= 3 && avail === "ok";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={editMode ? onClose : undefined} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (edit mode only) */}
        {editMode && onClose && (
          <button onClick={onClose} className="absolute right-4 top-4 text-text-dim hover:text-text-primary text-sm" aria-label="Close">✕</button>
        )}

        {/* Header + avatar */}
        <div className="text-center mb-6">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center overflow-hidden">
              {avatar ? (
                <IpfsImage uri={avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-3xl font-bold">{(username[0] || "O").toUpperCase()}</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs font-semibold text-amber hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            <span className="text-text-dim">·</span>
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="text-xs font-semibold text-amber hover:underline"
            >
              {showPicker ? "Close" : "Use an NFT"}
            </button>
            {avatar && (
              <>
                <span className="text-text-dim">·</span>
                <button onClick={() => setAvatar("")} className="text-xs font-semibold text-text-dim hover:text-red-400">Remove</button>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          {showPicker && (
            <div className="mb-4 p-3 border border-border rounded-xl bg-surface">
              <NftAvatarPicker owner={address} onPick={(img) => { setAvatar(img); setShowPicker(false); }} />
            </div>
          )}
          <h2 className="text-xl font-bold text-text-primary mb-1">
            {editMode ? "Edit profile" : "Set your profile"}
          </h2>
          <p className="text-sm text-text-secondary">
            {editMode ? "Update your details, connect your X, set a picture" : "Pick a unique name visible to everyone on OriginPad"}
          </p>
        </div>

        <div className="mb-5 space-y-3">
          {/* Username */}
          <div>
            <div className="relative">
              <input
                className="input-base pr-24"
                placeholder="cosmic_ape"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20))
                }
                maxLength={20}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium">
                {avail === "checking" && <span className="text-text-dim">checking...</span>}
                {avail === "ok" && <span className="text-green-500">✓ available</span>}
                {avail === "taken" && <span className="text-red-400">✗ taken</span>}
              </div>
            </div>
            <p className="text-xs text-text-dim mt-1.5">3–20 chars · letters, numbers, underscores</p>
          </div>

          {/* X / Twitter — verified OAuth connect (no typed handle) */}
          <div>
            {twitter && twitterVerified ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-surface">
                <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-text-primary"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  @{twitter}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <button onClick={unlinkX} disabled={xBusy} className="text-[11px] font-semibold text-text-dim hover:text-red-400 disabled:opacity-50">
                  {xBusy ? "..." : "Unlink"}
                </button>
              </div>
            ) : (
              <button
                onClick={connectX}
                disabled={xBusy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary hover:border-amber transition-colors disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                {xBusy ? "Connecting…" : "Connect with X"}
              </button>
            )}
            <p className="mt-1 text-[10px] text-text-dim text-center">Verified via X login — your real handle, no faking</p>
          </div>

          {/* Website */}
          <input
            className="input-base"
            placeholder="https://yourwebsite.xyz (optional)"
            value={website}
            onChange={(e) => setWebsite(e.target.value.slice(0, 200))}
            maxLength={200}
          />

          {/* Bio */}
          <textarea
            className="input-base resize-y"
            rows={3}
            placeholder="Short bio (optional)"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            maxLength={280}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Buttons */}
        <button
          onClick={() => submit(false)}
          disabled={loading || !canSubmit}
          className="btn-primary btn-block mb-3"
        >
          {loading ? "Signing..." : editMode ? "Save" : "Set Profile"}
        </button>

        {!editMode && (
          <button
            onClick={() => submit(true)}
            disabled={loading}
            className="w-full text-sm text-text-secondary hover:text-text-primary transition-colors py-2 disabled:opacity-40"
          >
            Skip — give me a random username
          </button>
        )}

        <p className="text-center text-xs text-text-dim mt-3">Free · No gas · Sign once</p>
      </motion.div>
    </div>
  );
}

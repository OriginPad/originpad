"use client";

import { useState, useCallback } from "react";
import { useAccount, useConnect, useWriteContract, useReadContract, usePublicClient, useSignMessage } from "wagmi";
import { parseEther, parseUnits, parseEventLogs } from "viem";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { CONTRACTS, LAUNCHPAD_ABI } from "@/lib/contracts";
import { uploadToIPFS } from "@/lib/ipfs";
import { parseAddresses, buildTree, uploadAllowlistToIPFS, ZERO_ROOT } from "@/lib/allowlist";
import { RarityPreview } from "@/components/collection/RarityPreview";

type Step = 1 | 2 | 3 | 4;

interface FormData {
  name: string;
  ticker: string;
  bio: string;
  socialX: string;
  socialGithub: string;
  socialFarcaster: string;
  websiteURL: string;
  revealTiming: "instant" | "24h" | "7d";
  unrevealPhoto: File | null; // mystery image shown on every NFT until reveal (required for 24h/7d)
  photos: File[];
  mintPriceETH: string;
  // Token (optional) — deploy an ERC20 + V4 pool at bonding, with a custom swap fee
  tokenEnabled: boolean;
  tokenFeePct: string; // 1.5 to 3.5
  antiSniper: boolean;     // F1: anti-sniper fee decay (80% -> base fee over N seconds)
  decaySeconds: number;    // F1: decay window length (default 10s)
  feeReceiveType: number;  // F2: creator fee delivery 0=ETH, 1=token, 2=both
  // Phase config (Team, GTD, FCFS, Public)
  teamEnabled: boolean;
  teamStart: string;
  teamEnd: string;
  teamMax: string;
  teamAddresses: string;
  gtdEnabled: boolean;
  gtdStart: string;   // datetime-local string
  gtdEnd: string;
  gtdMax: string;     // max per wallet
  gtdAddresses: string; // textarea, one per line
  fcfsEnabled: boolean;
  fcfsStart: string;
  fcfsEnd: string;
  fcfsMax: string;
  fcfsAddresses: string;
  publicStart: string;
  publicEnd: string;
  publicMax: string;  // 0 = unlimited
}

const STEP_LABELS = ["IDENTITY", "MEDIA", "ECONOMICS", "SCHEDULE"];

export default function LaunchPage() {
  const { isConnected: authenticated, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { connect, connectors } = useConnect();
  const login = () => connect({ connector: connectors[0] });
  const [step, setStep] = useState<Step>(1);
  const [isUploading, setIsUploading] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "",
    ticker: "",
    bio: "",
    socialX: "",
    socialGithub: "",
    socialFarcaster: "",
    websiteURL: "",
    photos: [],
    mintPriceETH: "0",
    tokenEnabled: true,
    tokenFeePct: "1.5",
    antiSniper: false,
    decaySeconds: 10,
    feeReceiveType: 0,
    revealTiming: "instant",
    unrevealPhoto: null,
    teamEnabled: false,
    teamStart: "",
    teamEnd: "",
    teamMax: "5",
    teamAddresses: "",
    gtdEnabled: false,
    gtdStart: "",
    gtdEnd: "",
    gtdMax: "2",
    gtdAddresses: "",
    fcfsEnabled: false,
    fcfsStart: "",
    fcfsEnd: "",
    fcfsMax: "1",
    fcfsAddresses: "",
    publicStart: "",
    publicEnd: "",
    publicMax: "0",
  });

  // Read platform fee
  const { data: platformFeeWei } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: LAUNCHPAD_ABI,
    functionName: "getPlatformFeeETH",
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  // ─── Photo Upload ───────────────────────────────────────────────────────────
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const remaining = 6 - form.photos.length;
    const newPhotos = acceptedFiles.slice(0, remaining);
    setForm((f) => ({ ...f, photos: [...f.photos, ...newPhotos] }));
  }, [form.photos.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const tooBig = rejections.some((r) => r.errors.some((e) => e.code === "file-too-large"));
      if (tooBig) toast.error("Each photo must be 4MB or smaller");
    },
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
    maxSize: 4 * 1024 * 1024, // 4MB per file — keeps IPFS storage lean
    disabled: form.photos.length >= 6,
  });

  const removePhoto = (index: number) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
  };

  // ─── Validation ─────────────────────────────────────────────────────────────
  const canProceed = {
    1: form.name.length >= 2 && form.ticker.length >= 2 && form.bio.length >= 1,
    2: form.photos.length >= 3,
    3: true,
    4: form.revealTiming === "instant" || form.unrevealPhoto !== null, // delayed reveal needs a mystery photo
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!address) return;
    if (form.revealTiming !== "instant" && !form.unrevealPhoto) {
      toast.error("Upload a mystery photo for delayed reveal");
      return;
    }
    setIsUploading(true);

    try {
      toast.loading("Preparing everything...", { id: "launch" });

      // Upload photos to IPFS
      const photoURIs: string[] = [];
      for (const photo of form.photos) {
        const uri = await uploadToIPFS(photo);
        photoURIs.push(uri);
      }

      // Mystery photo for delayed reveal — shown on every NFT until reveal
      let unrevealedURI = "";
      if (form.revealTiming !== "instant" && form.unrevealPhoto) {
        unrevealedURI = await uploadToIPFS(form.unrevealPhoto);
      }

      // Pad to 6
      while (photoURIs.length < 6) photoURIs.push("");

      // Calculate params
      const mintPriceWei = form.mintPriceETH
        ? parseEther(form.mintPriceETH)
        : BigInt(0);

      // ── Build allowlist phases ──
      const now = BigInt(Math.floor(Date.now() / 1000));
      const FAR_FUTURE = BigInt(9999999999); // no expiry
      const toUnix = (s: string) => (s ? BigInt(Math.floor(new Date(s).getTime() / 1000)) : BigInt(0));
      const startOf = (s: string) => (s ? toUnix(s) : now);
      const endOf = (s: string) => (s ? toUnix(s) : FAR_FUTURE);

      const teamAddrs = form.teamEnabled ? parseAddresses(form.teamAddresses) : [];
      const gtdAddrs = form.gtdEnabled ? parseAddresses(form.gtdAddresses) : [];
      const fcfsAddrs = form.fcfsEnabled ? parseAddresses(form.fcfsAddresses) : [];

      const teamRoot = (form.teamEnabled && teamAddrs.length > 0 ? buildTree(teamAddrs).root : ZERO_ROOT) as `0x${string}`;
      const gtdRoot = (form.gtdEnabled ? buildTree(gtdAddrs).root : ZERO_ROOT) as `0x${string}`;
      const fcfsRoot = (form.fcfsEnabled ? buildTree(fcfsAddrs).root : ZERO_ROOT) as `0x${string}`;
      const publicRoot = ZERO_ROOT as `0x${string}`;

      // Upload allowlists to IPFS
      let allowlistCID = "";
      if (teamAddrs.length > 0 || gtdAddrs.length > 0 || fcfsAddrs.length > 0) {
        toast.loading("Preparing everything...", { id: "launch" });
        const jwt = process.env.NEXT_PUBLIC_PINATA_JWT || "";
        allowlistCID = await uploadAllowlistToIPFS({ team: teamAddrs, gtd: gtdAddrs, fcfs: fcfsAddrs }, jwt);
      }

      const pubStart = startOf(form.publicStart);
      const phaseRoots: [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] = [teamRoot, gtdRoot, fcfsRoot, publicRoot];
      const phaseStarts: [bigint, bigint, bigint, bigint] = [
        form.teamEnabled ? toUnix(form.teamStart) : pubStart,
        form.gtdEnabled ? toUnix(form.gtdStart) : pubStart,
        form.fcfsEnabled ? toUnix(form.fcfsStart) : pubStart,
        pubStart,
      ];
      const phaseEnds: [bigint, bigint, bigint, bigint] = [
        form.teamEnabled ? toUnix(form.teamEnd) : pubStart,
        form.gtdEnabled ? toUnix(form.gtdEnd) : pubStart,
        form.fcfsEnabled ? toUnix(form.fcfsEnd) : pubStart,
        endOf(form.publicEnd),
      ];
      const phaseMax: [bigint, bigint, bigint, bigint] = [
        BigInt(form.teamEnabled ? Number(form.teamMax || "0") : 0),
        BigInt(form.gtdEnabled ? Number(form.gtdMax || "0") : 0),
        BigInt(form.fcfsEnabled ? Number(form.fcfsMax || "0") : 0),
        BigInt(Number(form.publicMax || "0")),
      ];

      // Token swap fee: 1.5% (150 bps) base, up to 3.5% (350 bps). 0 if NFT-only.
      const feeBpsRaw = Math.round(Number(form.tokenFeePct || "1.5") * 100);
      const tokenFeeBps = form.tokenEnabled
        ? BigInt(Math.min(350, Math.max(150, feeBpsRaw)))
        : BigInt(0);

      toast.loading("Confirming transaction...", { id: "launch" });

      const txHash = await writeContractAsync({
        address: CONTRACTS.launchpad,
        abi: LAUNCHPAD_ABI,
        functionName: "launchCollection",
        args: [
          {
            name: form.name,
            ticker: form.ticker.toUpperCase(),
            bio: form.bio,
            photoURIs: photoURIs as [string, string, string, string, string, string],
            photoCount: form.photos.length as 3 | 4 | 5 | 6,
            socialX: form.socialX,
            socialGithub: form.socialGithub,
            socialFarcaster: form.socialFarcaster,
            mintPriceWei,
            tokenEnabled: form.tokenEnabled,
            tokenFeeBps,
            decaySeconds: BigInt(form.tokenEnabled && form.antiSniper ? form.decaySeconds || 10 : 0), // F1
            feeReceiveType: form.tokenEnabled ? form.feeReceiveType : 0, // F2
            phaseRoots: phaseRoots as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`],
            phaseStarts: phaseStarts as [bigint, bigint, bigint, bigint],
            phaseEnds: phaseEnds as [bigint, bigint, bigint, bigint],
            phaseMaxPerWallet: phaseMax as [bigint, bigint, bigint, bigint],
            allowlistCID,
          },
        ],
        gas: 6000000n,
      });

      // Persist reveal timing + mystery photo. This is the only record of the
      // creator's reveal choice; if it never saves, a timed collection fails
      // open to instant and leaks its art, so retry a few times before giving up.
      try {
        const receipt = await publicClient!.waitForTransactionReceipt({ hash: txHash });
        const logs = parseEventLogs({ abi: LAUNCHPAD_ABI, logs: receipt.logs, eventName: "CollectionLaunched" });
        const newCol = (logs[0] as any)?.args?.collection;
        if (newCol) {
          const API = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";
          // Sign so only the on-chain creator can set this collection's meta (audit O1)
          const key = String(newCol).toLowerCase();
          const timestamp = Date.now();
          const signature = await signMessageAsync({ message: `Set OriginPad collection meta\nCollection: ${key}\nTimestamp: ${timestamp}` });
          const body = JSON.stringify({ collection: newCol, revealTiming: form.revealTiming, websiteURL: form.websiteURL, unrevealedURI, signature, timestamp });
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const r = await fetch(`${API}/api/collection/meta`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
              if (r.ok) break;
            } catch {}
            await new Promise(res => setTimeout(res, 1500));
          }
        }
      } catch (e) {}
      toast.success("Collection launched!", { id: "launch" });
      window.location.href = "/explore";
    } catch (err: any) {
      toast.error(err?.shortMessage || "Launch failed", { id: "launch" });
    } finally {
      setIsUploading(false);
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center">
        <p
          className="text-5xl text-amber mb-4"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}
        >
          CONNECT WALLET
        </p>
        <p className="text-sm text-text-secondary mb-8">
          You need to be connected to launch a collection
        </p>
        <button onClick={login} className="btn-primary">
          CONNECT
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {/* Header */}
      <div className="mb-12">
        <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-2">CREATE</p>
        <h1
          style={{ fontFamily: "var(--font-display)", fontSize: "3.5rem", letterSpacing: "0.04em" }}
        >
          LAUNCH COLLECTION
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-12">
        {STEP_LABELS.map((label, i) => {
          const s = (i + 1) as Step;
          const isActive = step === s;
          const isDone = step > s;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => isDone && setStep(s)}
                className={`flex flex-col items-center gap-1 ${isDone ? "cursor-pointer" : "cursor-default"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-semibold transition-all ${
                    isActive
                      ? "border-amber bg-amber text-white"
                      : isDone
                      ? "border-amber text-amber"
                      : "border-border text-text-dim"
                  }`}
                >
                  {isDone ? "✓" : s}
                </div>
                <span
                  className={`text-[10px] font-semibold hidden sm:block ${
                    isActive ? "text-amber" : "text-text-dim"
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < STEP_LABELS.length - 1 && (
                <div className={`flex-1 h-px mx-2 transition-colors ${step > s ? "bg-amber" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Steps */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {/* STEP 1: Identity */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-6">PROJECT IDENTITY</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-2">NAME *</label>
                    <input
                      className="input-base"
                      placeholder="My Collection"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-2">TICKER * (token symbol)</label>
                    <input
                      className="input-base uppercase"
                      placeholder="MYCOL"
                      value={form.ticker}
                      onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                      maxLength={10}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-2">BIO * </label>
                    <textarea
                      className="input-base min-h-[100px] resize-y"
                      placeholder="Tell your story..."
                      value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      maxLength={500}
                    />
                    <p className="font-mono text-xs text-text-dim mt-1 text-right">{form.bio.length}/500</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-6">SOCIAL LINKS (optional)</p>
                <div className="space-y-4">
                  {[
                    { key: "socialX", label: "X / TWITTER", placeholder: "@handle" },
                    { key: "socialGithub", label: "GITHUB", placeholder: "username" },
                    { key: "socialFarcaster", label: "FARCASTER", placeholder: "@handle" },
                    { key: "websiteURL", label: "WEBSITE", placeholder: "https://yourproject.xyz" },
                  ].map((s) => (
                    <div key={s.key}>
                      <label className="text-xs font-medium text-text-secondary block mb-2">{s.label}</label>
                      <input
                        className="input-base"
                        placeholder={s.placeholder}
                        value={(form as any)[s.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Photos */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs font-semibold text-amber uppercase tracking-wide">PHOTOS (3–6)</p>
                  <span className="badge border-border text-text-secondary">
                    {form.photos.length}/6 uploaded
                  </span>
                </div>

                {/* Dropzone */}
                {form.photos.length < 6 && (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors mb-6 ${
                      isDragActive ? "border-amber bg-amber/5" : "border-border hover:border-amber/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <p
                      className="text-3xl text-amber/40 mb-3"
                      style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
                    >
                      DROP PHOTOS
                    </p>
                    <p className="text-xs text-text-dim">
                      PNG, JPG, WEBP · max 4MB each · {6 - form.photos.length} slots remaining
                    </p>
                  </div>
                )}

                {/* Photo grid */}
                {form.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {form.photos.map((file, i) => (
                      <div key={i} className="relative aspect-square bg-surface border border-border rounded-xl overflow-hidden group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`photo-${i}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Rarity label */}
                        <div className="absolute bottom-0 left-0 right-0 bg-void/90 py-1 px-2">
                          <p className="text-[10px] font-semibold text-text-dim">
                            {["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"][i] || "BONUS"}
                            {i === form.photos.length - 1 && form.photos.length >= 3 && (
                              <span className="text-mythic ml-1">★ TOKEN</span>
                            )}
                          </p>
                        </div>
                        {/* Remove btn */}
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-void/90 border border-border text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rarity note */}
                <div className="mt-6 p-4 bg-surface border border-border rounded-xl">
                  <p className="text-xs text-text-dim leading-relaxed">
                    ⓘ Photo order = rarity tier. The <span className="text-mythic">last photo</span> becomes the
                    Mythic NFT image and is used for the token. Min 3 photos = Common, Uncommon, Rare/Mythic.
                  </p>
                </div>
              </div>

              <RarityPreview photoCount={form.photos.length} />
            </div>
          )}

          {/* STEP 3: Economics */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-6">MINT PRICE</p>

                <div className="mb-6">
                  <label className="text-xs font-medium text-text-secondary block mb-2">
                    YOUR PRICE (ETH) — can be 0
                  </label>
                  <input
                    className="input-base"
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.0"
                    value={form.mintPriceETH}
                    onChange={(e) => setForm((f) => ({ ...f, mintPriceETH: e.target.value }))}
                  />
                  <p className="text-xs text-text-dim mt-2">
                    All mint proceeds go to the bonding pool (not to you directly)
                  </p>
                </div>

                {/* Fee breakdown */}
                <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-3">MINTER PAYS</p>
                  {[
                    { label: "Your price", value: `${form.mintPriceETH || "0"} ETH` },
                    { label: "Platform fee", value: "0.0003 ETH" },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between text-xs">
                      <span className="text-text-secondary">{r.label}</span>
                      <span className="font-mono text-text-primary">{r.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex justify-between text-xs">
                    <span className="font-semibold text-amber">Total</span>
                    <span className="font-mono text-amber">
                      {form.mintPriceETH || "0"} ETH + 0.0003 ETH
                    </span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-amber uppercase tracking-wide">DEPLOY TOKEN AFTER BONDING</p>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tokenEnabled: !f.tokenEnabled }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${form.tokenEnabled ? "bg-amber" : "bg-border"}`}
                    aria-label="Toggle token deploy"
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.tokenEnabled ? "translate-x-6" : ""}`} />
                  </button>
                </div>

                {form.tokenEnabled ? (
                  <>
                    <p className="text-xs text-text-secondary mb-4">
                      At the 100th mint an ERC20 token plus a Uniswap V4 pool deploy automatically. Name, photo and links reuse this collection.
                    </p>

                    {/* Fee slider */}
                    <div className="mb-5">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium text-text-secondary">SWAP FEE (Buy/Sell)</label>
                        <span className="font-mono text-sm font-bold text-amber">{Number(form.tokenFeePct).toFixed(1)}%</span>
                      </div>
                      <input
                        type="range"
                        min="1.5"
                        max="3.5"
                        step="0.1"
                        value={form.tokenFeePct}
                        onChange={(e) => setForm((f) => ({ ...f, tokenFeePct: e.target.value }))}
                        className="w-full accent-amber"
                      />
                      <div className="flex justify-between text-[10px] text-text-dim mt-1">
                        <span>1.5% min</span>
                        <span>3.5% max</span>
                      </div>
                    </div>

                    {/* Dynamic split */}
                    <div className="space-y-2 text-xs">
                      {(() => {
                        const fee = Math.min(3.5, Math.max(1.5, Number(form.tokenFeePct) || 1.5));
                        const part = (bps: number) => `${((fee * bps) / 150).toFixed(2)}%`;
                        return [
                          { label: "Starting MC", value: "~$10,000" },
                          { label: "Buy/Sell fee", value: `${fee.toFixed(1)}%` },
                          { label: "→ You (creator)", value: part(100) },
                          { label: "→ Platform", value: part(20) },
                          { label: "→ Maintenance", value: part(20) },
                          { label: "→ Airdrop vault", value: part(10) },
                        ];
                      })().map((r) => (
                        <div key={r.label} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                          <span className="text-text-secondary">{r.label}</span>
                          <span className="font-mono text-text-primary">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">
                    NFT-only collection. No token or trading pool. After the 100th mint the marketplace unlocks and you can withdraw the bonding pool ETH.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Schedule */}
          {step === 4 && (
            <div className="space-y-6">
              {/* REVEAL TIMING */}
              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-2">REVEAL TIMING</p>
                <p className="text-xs text-text-secondary mb-4">Instant reveals rarities at sellout. 24h/7d keeps every NFT hidden behind your mystery photo until the timer ends.</p>
                <div className="grid grid-cols-3 gap-2">
                  {([["instant","Instant"],["24h","24 Hours"],["7d","7 Days"]] as const).map(([val,label])=>(
                    <button key={val} onClick={()=>setForm(f=>({...f,revealTiming:val}))}
                      className={`py-2.5 text-sm font-medium rounded-xl border transition-colors ${form.revealTiming===val?"bg-amber text-white border-amber":"border-border text-text-secondary hover:border-amber/40"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Mystery photo upload — required for delayed reveal */}
                {form.revealTiming !== "instant" && (
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-xs font-semibold text-text-primary mb-1">MYSTERY PHOTO <span className="text-red-400">*</span></p>
                    <p className="text-[11px] text-text-secondary mb-3">Shown on every minted NFT until reveal ({form.revealTiming} after sellout). Max 4MB.</p>
                    <div className="flex items-center gap-3">
                      <label className="btn-outline btn-sm cursor-pointer">
                        {form.unrevealPhoto ? "CHANGE PHOTO" : "UPLOAD PHOTO"}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > 4 * 1024 * 1024) { toast.error("Mystery photo must be 4MB or smaller"); e.target.value = ""; return; }
                            setForm((p) => ({ ...p, unrevealPhoto: f }));
                          }} />
                      </label>
                      {form.unrevealPhoto && (
                        <img src={URL.createObjectURL(form.unrevealPhoto)} alt="Mystery preview"
                          className="w-12 h-12 object-cover rounded-lg border border-border" />
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* TEAM PHASE */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-amber uppercase tracking-wide">PHASE 0 — TEAM</p>
                    <p className="text-[10px] text-text-dim mt-0.5">Your team mints before public. Add team wallet addresses.</p>
                  </div>
                  <button
                    onClick={() => setForm((f) => ({ ...f, teamEnabled: !f.teamEnabled }))}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                      form.teamEnabled ? "border-amber bg-amber/10 text-amber" : "border-border text-text-secondary"
                    }`}
                  >
                    {form.teamEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                {form.teamEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">START (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.teamStart}
                          onChange={(e) => setForm((f) => ({ ...f, teamStart: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">END (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.teamEnd}
                          onChange={(e) => setForm((f) => ({ ...f, teamEnd: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">MAX PER WALLET</label>
                      <input type="number" min="1" className="input-base text-xs" value={form.teamMax}
                        onChange={(e) => setForm((f) => ({ ...f, teamMax: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">TEAM ADDRESSES (one per line)</label>
                      <textarea rows={4} className="input-base text-xs font-mono" placeholder="0x...&#10;0x..."
                        value={form.teamAddresses}
                        onChange={(e) => setForm((f) => ({ ...f, teamAddresses: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* GTD PHASE */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-amber uppercase tracking-wide">PHASE 1 — GTD (GUARANTEED)</p>
                  <button
                    onClick={() => setForm((f) => ({ ...f, gtdEnabled: !f.gtdEnabled }))}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                      form.gtdEnabled ? "border-amber bg-amber/10 text-amber" : "border-border text-text-secondary"
                    }`}
                  >
                    {form.gtdEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                {form.gtdEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">START (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.gtdStart}
                          onChange={(e) => setForm((f) => ({ ...f, gtdStart: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">END (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.gtdEnd}
                          onChange={(e) => setForm((f) => ({ ...f, gtdEnd: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">MAX PER WALLET</label>
                      <input type="number" min="1" className="input-base text-xs" value={form.gtdMax}
                        onChange={(e) => setForm((f) => ({ ...f, gtdMax: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">ADDRESSES (one per line)</label>
                      <textarea rows={4} className="input-base text-xs font-mono" placeholder="0x...&#10;0x..."
                        value={form.gtdAddresses}
                        onChange={(e) => setForm((f) => ({ ...f, gtdAddresses: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* FCFS PHASE */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-amber uppercase tracking-wide">PHASE 2 — FCFS (FIRST COME)</p>
                  <button
                    onClick={() => setForm((f) => ({ ...f, fcfsEnabled: !f.fcfsEnabled }))}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                      form.fcfsEnabled ? "border-amber bg-amber/10 text-amber" : "border-border text-text-secondary"
                    }`}
                  >
                    {form.fcfsEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                {form.fcfsEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">START (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.fcfsStart}
                          onChange={(e) => setForm((f) => ({ ...f, fcfsStart: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary block mb-1">END (UTC)</label>
                        <input type="datetime-local" className="input-base text-xs" value={form.fcfsEnd}
                          onChange={(e) => setForm((f) => ({ ...f, fcfsEnd: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">MAX PER WALLET</label>
                      <input type="number" min="1" className="input-base text-xs" value={form.fcfsMax}
                        onChange={(e) => setForm((f) => ({ ...f, fcfsMax: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">ADDRESSES (one per line)</label>
                      <textarea rows={4} className="input-base text-xs font-mono" placeholder="0x...&#10;0x..."
                        value={form.fcfsAddresses}
                        onChange={(e) => setForm((f) => ({ ...f, fcfsAddresses: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* PUBLIC PHASE */}
              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-4">PHASE 3 — PUBLIC (required)</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">START (UTC)</label>
                      <input type="datetime-local" className="input-base text-xs" value={form.publicStart}
                        onChange={(e) => setForm((f) => ({ ...f, publicStart: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">END (UTC)</label>
                      <input type="datetime-local" className="input-base text-xs" value={form.publicEnd}
                        onChange={(e) => setForm((f) => ({ ...f, publicEnd: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">MAX PER WALLET (0 = unlimited)</label>
                    <input type="number" min="0" className="input-base text-xs" value={form.publicMax}
                      onChange={(e) => setForm((f) => ({ ...f, publicMax: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* SUMMARY */}
              <div className="card">
                <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-4">LAUNCH SUMMARY</p>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "Name", value: form.name },
                    { label: "Ticker", value: `$${form.ticker}` },
                    { label: "Photos", value: `${form.photos.length} uploaded` },
                    { label: "Mint price", value: `${form.mintPriceETH || "0"} ETH + fee` },
                    { label: "GTD", value: form.gtdEnabled ? `${form.gtdMax}/wallet` : "off" },
                    { label: "FCFS", value: form.fcfsEnabled ? `${form.fcfsMax}/wallet` : "off" },
                    { label: "Public", value: form.publicMax === "0" ? "unlimited" : `${form.publicMax}/wallet` },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-text-secondary">{r.label}</span>
                      <span className="font-mono text-text-primary truncate ml-4 max-w-[200px] text-right">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between mt-10">
        <button
          onClick={() => step > 1 && setStep((s) => (s - 1) as Step)}
          disabled={step === 1}
          className="btn-ghost disabled:opacity-30 disabled:pointer-events-none"
        >
          ← BACK
        </button>

        {step < 4 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={!canProceed[step]}
            className="btn-primary"
          >
            CONTINUE →
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={!canProceed[4] || isPending || isUploading}
            className="btn-primary min-w-[160px]"
          >
            {isPending || isUploading ? "LAUNCHING..." : "LAUNCH NOW"}
          </button>
        )}
      </div>
    </div>
  );
}

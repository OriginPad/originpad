import Link from "next/link";
import { NEWS_ITEMS } from "@/lib/landing-content";
import { RevealText } from "@/components/landing/RevealText";
import { PortalImage, FadeInUp, CandleChart, FloatImg } from "@/components/landing/LandingExtras";

const APP_URL = "https://app.originpad.live/explore";

const STEPS = [
  { n: "01", title: "Launch", text: "Upload 3-6 photos, set your price and phases. Your collection of exactly 100 NFTs goes live and launching costs only gas." },
  { n: "02", title: "Mint through phases", text: "TEAM, GTD and FCFS allowlists are enforced on-chain with merkle proofs and per-wallet caps, then the public mints the rest." },
  { n: "03", title: "Bond", text: "The 100th mint triggers bonding: rarities shuffle with an unpredictable seed and an ERC-20 token deploys automatically." },
  { n: "04", title: "Trade", text: "Liquidity is seeded and locked forever. Buy and sell in-app with a 1.5% fee paid in ETH, and the vault starts its burn + airdrop schedule." },
];

const PILLARS = [
  { img: "/landing/vault.png", title: "Liquidity locked, not promised", text: "The Uniswap V4 pool is created by the contract and the liquidity has no withdrawal path. No one can pull it. Ever." },
  { img: "/landing/orb.png", title: "Nothing to snipe", text: "Rarities don't exist until sellout. The whole 46/30/15/5/1/3 distribution shuffles in one transaction with a seed no bot can predict." },
  { img: "/landing/coin.png", title: "Hard-coded vault schedule", text: "50% of every token locks in the vault: 9% burned and 1% airdropped to the top-100 trading losers on days 1, 7, 14, 28 and 56." },
  { img: "/landing/book.png", title: "On-chain truth, no approvals", text: "Every guarantee is readable on-chain, and the marketplace lives inside the NFT contract itself. No external operator to approve, so the classic wallet-drain does not apply." },
];

export default function LandingPage() {
  const latest = NEWS_ITEMS.slice(0, 3);
  return (
    <div>
      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-5 pt-16 pb-14">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="relative z-10 text-center lg:text-left">
            <span className="inline-block px-4 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full mb-6">
              LIVE ON BASE
            </span>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6" style={{ fontFamily: "var(--font-display)" }}>
              <RevealText text="The launchpad built so" />
              <br />
              <RevealText text="you can't get rugged" className="text-indigo-500" />
            </h1>
            <p className="max-w-xl mx-auto lg:mx-0 text-lg text-gray-500 mb-10">
              Mint 100 NFTs, get a token with locked liquidity, automatically.
              No team allocation, no LP keys, no rarity sniping. Every guarantee is
              enforced by the contract, not a promise.
            </p>
            <div className="flex items-center justify-center lg:justify-start gap-3">
              <a href={APP_URL}
                className="px-8 py-3.5 bg-indigo-500 text-white text-sm font-semibold rounded-full hover:bg-indigo-600 transition-colors shadow-md">
                Open App
              </a>
              <Link href="/landing/docs"
                className="px-8 py-3.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                Read the Docs
              </Link>
            </div>
          </div>
          <PortalImage />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest text-center mb-3">How it works</p>
        <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: "var(--font-display)" }}>
          <RevealText text="From photos to a live token in one flow" />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s) => (
            <div key={s.n} className="p-6 border border-white/50 rounded-2xl bg-white/25 backdrop-blur-md hover:bg-white/35 hover:-translate-y-0.5 transition-all">
              <span className="text-xs font-bold text-indigo-300">{s.n}</span>
              <h3 className="text-lg font-semibold mt-2 mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security pillars */}
      <section>
        <div className="max-w-6xl mx-auto px-5 py-16">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest text-center mb-3">Why OriginPad</p>
          <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: "var(--font-display)" }}>
            <RevealText text="Security by design, not by trust" />
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PILLARS.map((p, i) => (
              <FadeInUp key={p.title} index={i}>
                <div className="p-6 border border-white/50 rounded-2xl bg-white/25 backdrop-blur-md hover:bg-white/35 transition-colors h-full">
                  <FloatImg src={p.img} alt={p.title} dur={4 + i * 0.4}
                    className="h-24 w-24 object-contain mb-3 drop-shadow-[0_10px_22px_rgba(99,102,241,0.30)]" />
                  <h3 className="text-lg font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{p.text}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      {/* Security feed preview */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-3">Security feed</p>
            <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              <RevealText text="What goes wrong out there, and why it can't here" />
            </h2>
          </div>
          <Link href="/landing/news" className="hidden sm:block text-sm font-semibold text-indigo-500 hover:text-indigo-700 transition-colors whitespace-nowrap">
            View all →
          </Link>
        </div>
        <div className="mb-6"><CandleChart /></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {latest.map((n, i) => (
            <FadeInUp key={n.slug} index={i}>
              <Link href="/landing/news"
                className="p-6 border border-white/50 rounded-2xl bg-white/25 backdrop-blur-md hover:bg-white/35 hover:-translate-y-0.5 transition-all block h-full">
                <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-red-500 bg-red-50 rounded-full mb-3">{n.tag}</span>
                <h3 className="text-base font-semibold mb-2 leading-snug">{n.title}</h3>
                <p className="text-sm text-gray-500 line-clamp-3">{n.caseSummary}</p>
                <p className="text-xs font-semibold text-indigo-500 mt-4">How OriginPad prevents it</p>
              </Link>
            </FadeInUp>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-5 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
          Ready to launch or mint?
        </h2>
        <p className="text-gray-500 mb-8">Everything on this page is enforced by contracts you can read on-chain.</p>
        <a href={APP_URL}
          className="inline-block px-10 py-4 bg-indigo-500 text-white text-sm font-semibold rounded-full hover:bg-indigo-600 transition-colors shadow-md">
          Open App
        </a>
      </section>
    </div>
  );
}

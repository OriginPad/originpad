import Link from "next/link";
import type { Metadata } from "next";
import { LandingMotion } from "@/components/landing/LandingMotion";

export const metadata: Metadata = {
  title: "OriginPad: The launchpad built so you can't get rugged",
  description:
    "NFT × Token launchpad on Base. Locked liquidity on Uniswap V4, on-chain allowlists, anti-snipe reveals and a hard-coded vault schedule.",
};

const APP_URL = "https://app.originpad.live/explore";
const SUPPORT_URL = "https://app.originpad.live/support";
const X_URL = "https://x.com/OriginLaunchpad";
const GITHUB_URL = "https://github.com/OriginLaunchpad";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-transparent text-gray-900 overflow-x-clip">
      <LandingMotion />
      {/* Landing header */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/landing" className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            ORIGIN<span className="text-indigo-500">PAD</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-6">
            <Link href="/landing/docs" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-2">
              Docs
            </Link>
            <Link href="/landing/news" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-2">
              Security&nbsp;Feed
            </Link>
            <a href={SUPPORT_URL} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-2">
              Support
            </a>
          </nav>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-24">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} OriginPad. NFT × Token launchpad on Base
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/landing/docs" className="hover:text-gray-700 transition-colors">Docs</Link>
            <Link href="/landing/news" className="hover:text-gray-700 transition-colors">Security Feed</Link>
            <a href={SUPPORT_URL} className="hover:text-gray-700 transition-colors">Support</a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">X</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">GitHub</a>
            <a href={APP_URL} className="hover:text-gray-700 transition-colors">App</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

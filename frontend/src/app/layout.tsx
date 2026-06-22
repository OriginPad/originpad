import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ErrorCatch } from "./error-catch";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { TestnetBanner } from "@/components/layout/TestnetBanner";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { LaunchGate } from "@/components/launch/LaunchGate";
import { LandingMotion } from "@/components/landing/LandingMotion";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  // Resolves all relative OG/Twitter image URLs against the production domain
  // instead of localhost, so shared links on X/Telegram/Discord render the preview.
  metadataBase: new URL("https://originpad.live"),
  title: "OriginPad · NFT × Token Launchpad on Base",
  description:
    "Launch verified NFT collections with bonding curves. Earn tokens. Trade on Base.",
  openGraph: {
    type: "website",
    title: "OriginPad",
    description: "NFT × Token Launchpad on Base",
    url: "https://originpad.live",
    siteName: "OriginPad",
    // og.jpg (~150KB) is the primary card so previews fetch reliably even on
    // WhatsApp, which drops large images; og.png stays as a fallback.
    images: [
      { url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" },
      { url: "/og.png", width: 1200, height: 630, type: "image/png" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@OriginLaunchpad",
    creator: "@OriginLaunchpad",
    title: "OriginPad",
    description: "NFT × Token Launchpad on Base",
    images: ["/og.jpg"],
  },
  // Farcaster Mini App embed: bikin link OriginPad muncul sebagai kartu "Open"
  // yang nge-launch Mini App-nya pas di-cast di Warpcast. fc:frame = legacy fallback.
  other: {
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: "https://app.originpad.live/og.png",
      button: {
        title: "Open OriginPad",
        action: {
          type: "launch_miniapp",
          name: "OriginPad",
          url: "https://app.originpad.live",
          splashImageUrl: "https://app.originpad.live/splash.png",
          splashBackgroundColor: "#000000",
        },
      },
    }),
    "fc:frame": JSON.stringify({
      version: "1",
      imageUrl: "https://app.originpad.live/og.png",
      button: {
        title: "Open OriginPad",
        action: {
          type: "launch_frame",
          name: "OriginPad",
          url: "https://app.originpad.live",
          splashImageUrl: "https://app.originpad.live/splash.png",
          splashBackgroundColor: "#000000",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // On the marketing domain (originpad.live) the landing has its own chrome, so
  // skip the app's Navbar + bottom nav. The browser pathname stays "/" there
  // (middleware rewrites internally), so detect by host instead of path.
  const host = (headers().get("host") || "").toLowerCase();
  const isLandingDomain = host === "originpad.live" || host === "www.originpad.live";

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="noise"><ErrorCatch />
        <Providers>
          <LaunchGate>
            <div className={isLandingDomain ? "min-h-screen" : "relative min-h-screen"}>
              {/* App shares the landing's drifting cloudscape so the two feel
                  like one continuous world. Wrapped at -z-10 so all chrome and
                  content (banner, navbar, cards) sits above it. */}
              {!isLandingDomain && (
                <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
                  <LandingMotion />
                </div>
              )}
              {!isLandingDomain && <TestnetBanner />}
              {!isLandingDomain && <NetworkGuard />}
              {!isLandingDomain && <Navbar />}
              <main className={isLandingDomain ? "" : "pb-14 md:pb-0"}>{children}</main>
              {!isLandingDomain && <BottomNav />}
            </div>
          </LaunchGate>
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                color: "#1f2937",
                borderRadius: "12px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                fontSize: "13px",
              },
              success: {
                iconTheme: { primary: "#6366f1", secondary: "#ffffff" },
              },
              error: {
                icon: null,
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}

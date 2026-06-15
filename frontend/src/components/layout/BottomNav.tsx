"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LEFT = [
  { href: "/explore", label: "EXPLORE", icon: "◎" },
  { href: "/marketplace", label: "MARKET", icon: "◈" },
];
const NAV_RIGHT = [
  { href: "/leaderboard", label: "RANKS", icon: "◆" },
  { href: "/portfolio", label: "ME", icon: "◉" },
];

export function BottomNav() {
  const pathname = usePathname();
  const isLaunch = pathname.startsWith("/launch");

  // landing pages have their own chrome
  if (pathname.startsWith("/landing")) return null;

  const renderLink = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[9px] font-semibold transition-colors border-t-2
          ${active ? "text-amber border-amber" : "text-text-secondary border-transparent hover:text-text-primary"}`}
      >
        <span className={`text-[18px] leading-none ${active ? "opacity-100" : "opacity-40"}`}>{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/50 bg-white/70 backdrop-blur-xl safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {NAV_LEFT.map(renderLink)}

        {/* LAUNCH — pill button elevated above the nav bar */}
        <div className="relative flex flex-col items-center justify-center flex-1 h-full">
          <Link
            href="/launch"
            className={`absolute -top-5 flex flex-col items-center justify-center w-14 h-14 rounded-full text-[9px] font-bold shadow-lg transition-all
              ${isLaunch
                ? "bg-amber text-white shadow-amber/40"
                : "bg-amber text-white hover:bg-amber/90 shadow-amber/30"
              }`}
          >
            <span className="text-[22px] leading-none mb-0.5">＋</span>
            <span>LAUNCH</span>
          </Link>
        </div>

        {NAV_RIGHT.map(renderLink)}
      </div>
    </nav>
  );
}

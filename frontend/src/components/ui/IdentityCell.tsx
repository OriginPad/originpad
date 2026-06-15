"use client";

import Link from "next/link";
import { IpfsImage } from "@/components/ui/IpfsImage";
import { shortAddr, twitterLink, type Identity } from "@/lib/profiles";

// Renders a wallet identity: avatar + username (or short address) + optional X link.
// Set linkToProfile to make the avatar+name link to the public profile page.
// (Only use it where the cell is not already nested inside another link.)
export function IdentityCell({ address, identity, linkToProfile = false }: { address: string; identity?: Identity; linkToProfile?: boolean }) {
  const name = identity?.username || shortAddr(address);
  const x = twitterLink(identity?.twitter);
  const avatar = identity?.avatar || null;

  const inner = (
    <>
      {avatar ? (
        <IpfsImage uri={avatar} alt={name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber/40 to-amber/10 flex-shrink-0" />
      )}
      <span className={`text-sm truncate ${identity?.username ? "font-semibold text-text-primary" : "font-mono text-text-primary"}`}>
        {name}
      </span>
    </>
  );

  return (
    <div className="flex items-center gap-2 min-w-0">
      {linkToProfile ? (
        <Link href={`/u/${address}`} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
          {inner}
        </Link>
      ) : inner}
      {x && (
        <a
          href={x.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 text-text-dim hover:text-text-primary transition-colors"
          aria-label={`@${x.handle} on X`}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          {identity?.twitterVerified && (
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-green-500 -ml-0.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="verified"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </a>
      )}
    </div>
  );
}

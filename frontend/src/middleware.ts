import { NextRequest, NextResponse } from "next/server";

// Domain split:
//   originpad.live      -> marketing landing (/landing/*)
//   app.originpad.live  -> the actual app (routes untouched)
// Old app bookmarks on the root domain are redirected to the app subdomain.

const LANDING_PATHS = new Set(["/", "/docs", "/news"]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const isRootDomain = host === "originpad.live" || host === "www.originpad.live";
  if (!isRootDomain) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Farcaster Mini App manifest must be served as-is on BOTH domains (no redirect),
  // so clients can fetch /.well-known/farcaster.json at originpad.live too.
  if (pathname.startsWith("/.well-known")) return NextResponse.next();

  // already a landing asset/route
  if (pathname.startsWith("/landing")) return NextResponse.next();

  if (LANDING_PATHS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/landing" : `/landing${pathname}`;
    return NextResponse.rewrite(url);
  }

  // app routes hit on the root domain -> send to the app subdomain
  return NextResponse.redirect(`https://app.originpad.live${pathname}${req.nextUrl.search}`);
}

export const config = {
  // skip static assets and api proxy paths
  matcher: ["/((?!_next/|api/|favicon.ico|og.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)).*)"],
};

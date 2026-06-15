// Mystery placeholder for unrevealed NFTs (OpenSea-style reveal).
// Origin-themed: floating stone island in the lavender sky, matching the landing.

export const MYSTERY_URI = "/landing/mystery.jpg";

export function MysteryArt({ className = "" }: { className?: string }) {
  return <img src={MYSTERY_URI} alt="Unrevealed NFT" className={className} />;
}

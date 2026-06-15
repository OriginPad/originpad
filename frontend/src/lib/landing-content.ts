// Content for the originpad.live landing site (security feed + docs).
// Add new feed entries at the TOP of NEWS_ITEMS, newest first.

export interface NewsItem {
  slug: string;
  date: string; // YYYY-MM-DD (publication date on this feed)
  tag: "RUG PULL" | "EXPLOIT" | "SNIPING" | "SCAM" | "DUMP";
  title: string;
  /** what happened out there */
  caseSummary: string;
  /** how OriginPad's design prevents the same failure */
  prevention: string;
}

export const NEWS_ITEMS: NewsItem[] = [
  {
    slug: "lp-rug-pulls",
    date: "2026-06-12",
    tag: "RUG PULL",
    title: "Liquidity rug pulls: the #1 way token launches steal funds",
    caseSummary:
      "From Squid Game Token (2021) to countless memecoins since, the pattern is identical: the team controls the liquidity pool, waits for buy pressure, then withdraws the LP and leaves holders with a token that cannot be sold.",
    prevention:
      "On OriginPad the Uniswap V4 pool is created automatically by the contract when a collection mints out, and the liquidity is locked permanently: the contract that owns it has no function to remove it. Nobody, including the creator and the platform, can ever withdraw the liquidity. It is verifiable on-chain.",
  },
  {
    slug: "team-token-dumps",
    date: "2026-06-12",
    tag: "DUMP",
    title: "Team allocations dumped on holders in week one",
    caseSummary:
      "Many launches reserve 20-50% of supply for the team with no lockup. Evolved Apes (2021) and similar projects saw insiders dump everything within days, killing the chart and the community.",
    prevention:
      "OriginPad tokens have a fixed split: 50% goes into the locked liquidity pool, 50% is locked in the airdrop vault on a hard-coded schedule (day 1/7/14/28/56). Each epoch burns 9% of supply and airdrops 1% to the top-100 trading losers. There is no discretionary team bag to dump.",
  },
  {
    slug: "rarity-sniping",
    date: "2026-06-12",
    tag: "SNIPING",
    title: "Rarity sniping: bots minting the rares before you can",
    caseSummary:
      "When rarity is assigned per mint or metadata is uploaded before reveal, bots read the chain or the IPFS folder and snipe exactly the rare token IDs, leaving regular minters with commons.",
    prevention:
      "OriginPad assigns no rarity during minting. The full distribution (46/30/15/5/1/3) is shuffled in a single transaction at sellout, seeded by block data that does not exist until that moment. There is nothing to snipe. Every mint has identical odds.",
  },
  {
    slug: "presale-bypass",
    date: "2026-06-12",
    tag: "EXPLOIT",
    title: "Allowlist bypasses and bot-flooded public mints",
    caseSummary:
      "Poorly implemented presales have been bypassed by calling the contract directly, replaying signatures, or flooding the public phase with bot wallets that drain the supply in seconds.",
    prevention:
      "Phases on OriginPad are enforced on-chain with merkle proofs per wallet (TEAM / GTD / FCFS / PUBLIC), time windows, and per-wallet caps. A wallet that is not on the list cannot mint in that phase no matter how it calls the contract. We tested it with 50 wallets on every phase.",
  },
  {
    slug: "fake-marketplaces",
    date: "2026-06-12",
    tag: "SCAM",
    title: "Malicious marketplace approvals draining wallets",
    caseSummary:
      "A classic NFT drain: users sign a marketplace approval (setApprovalForAll) on a fake or compromised site, and the attacker transfers every NFT out of the wallet.",
    prevention:
      "OriginPad's marketplace is built into the NFT contract itself. Listing, buying and offers happen inside the collection, with no external operator contract to approve, so the drain-by-approval attack surface simply does not exist.",
  },
  {
    slug: "mint-treasury-theft",
    date: "2026-06-12",
    tag: "RUG PULL",
    title: "Mint proceeds vanishing before launch finishes",
    caseSummary:
      "Frosties (2022) and many smaller mints ended with the deployer wallet draining mint proceeds mid-sale and abandoning the project. The classic soft rug.",
    prevention:
      "Mint ETH on OriginPad goes into the collection's bonding pool, not the creator's wallet. At sellout, 20% automatically seeds the locked liquidity pool. Pre-bonding exits by minters carry a 50% penalty so a half-finished mint can't be silently drained.",
  },
];

// ─── Docs ─────────────────────────────────────────────────────────────────────

export interface DocSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    paragraphs: [
      "OriginPad is an NFT × Token launchpad on Base. Every collection has exactly 100 NFTs. When the last one mints, an ERC-20 token deploys automatically with locked liquidity. No team allocation, no manual steps.",
      "You need a wallet with ETH on Base (the current deployment runs on Base Sepolia testnet). Open the app, connect, and you can mint, trade or launch immediately.",
    ],
  },
  {
    id: "launching",
    title: "Launching a collection",
    paragraphs: [
      "Launching takes four steps: identity (name, ticker, bio, socials), media (3-6 photos, one per rarity tier, the last photo is the Mythic), economics (your mint price; a flat 0.0003 ETH platform fee per mint is added on top), and schedule.",
    ],
    bullets: [
      "Reveal timing: instant reveals rarities at sellout; 24h / 7d keeps every NFT hidden behind your own mystery photo until the timer ends (uploading the mystery photo is required).",
      "Phases: optionally enable TEAM, GTD and FCFS allowlists with their own time windows and per-wallet caps before the PUBLIC phase. Address lists are merkle-proofed on-chain.",
      "Launching costs only gas. Your collection appears in Explore immediately.",
    ],
  },
  {
    id: "minting",
    title: "Minting & phases",
    paragraphs: [
      "A collection mints through up to four phases: TEAM → GTD → FCFS → PUBLIC. Your eligibility and remaining allowance are shown on the mint page; proofs are generated automatically in your browser.",
      "All mint ETH accumulates in the collection's bonding pool. Selling back to the pool before bonding completes carries a 50% penalty, so strong hands are rewarded.",
    ],
  },
  {
    id: "rarity",
    title: "Rarity & reveal",
    paragraphs: [
      "Each collection has a fixed distribution out of 100: 46 Common, 30 Uncommon, 15 Rare, 5 Epic, 1 Legendary, 3 Mythic.",
      "No token has a rarity until the collection sells out. At the 100th mint the contract shuffles the whole distribution with a seed that cannot be predicted in advance, so sniping rares is impossible. If the creator chose delayed reveal, photos stay hidden for 24 hours or 7 days after sellout.",
    ],
  },
  {
    id: "bonding",
    title: "Bonding & the token",
    paragraphs: [
      "The 100th mint triggers bonding: an ERC-20 token (1B supply) deploys, a Uniswap V4 pool is created with 50% of the supply plus 20% of the pooled mint ETH, and the liquidity is locked forever (the owning contract has no removal path).",
      "Every swap carries a 1.5% fee, charged by the Uniswap V4 hook and paid out in ETH, split 1% to the collection creator, 0.2% to the platform, 0.1% to the airdrop vault and 0.2% to maintenance. The token itself has no transfer tax, so it always sells.",
    ],
  },
  {
    id: "vault",
    title: "Vault & epochs",
    paragraphs: [
      "The other 50% of supply locks in the vault on a fixed schedule: on days 1, 7, 14, 28 and 56 after lock, each epoch burns 9% of total supply and airdrops 1% to the top-100 trading losers, measured by an oracle from on-chain trades.",
      "The schedule is hard-coded. Nobody can skip a burn or redirect an airdrop.",
    ],
  },
  {
    id: "airdrops",
    title: "Airdrop eligibility",
    paragraphs: [
      "Each epoch airdrops 1% of supply to that token's top 100 trading losers. A loser is any wallet whose net ETH loss is positive, measured across both venues combined: the NFT marketplace (ETH spent minus ETH received on flips) and the token pool (ETH paid on buys minus ETH received on sells via the Uniswap V4 pool). The two are summed into one ranking per token.",
      "The airdrop is paid in the token itself, not ETH. Your share is proportional to how much you lost: the bigger your loss versus the rest of the top 100, the bigger your cut of the 1%.",
      "The standing updates continuously, then freezes at 23:30 UTC. Distribution runs at 00:00 UTC using that frozen list, so trades in the final 30 minutes do not change who qualifies for that epoch.",
    ],
    bullets: [
      "Open the Airdrops page and connect your wallet to see your live rank and estimated amount per token.",
      "Only wallets with a real net ETH loss qualify. Breaking even or profiting means you are not in the list.",
      "Ranking is per token. You can be eligible for one token and not another.",
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    paragraphs: [
      "After bonding, the built-in marketplace unlocks: list at your price (with optional expiry), buy listed NFTs, or make collection-wide offers any owner can accept.",
      "Sales carry a 1.5% total fee, paid out instantly in the same transaction: 1% to the creator, 0.2% to the platform, 0.2% to maintenance, 0.1% to the airdrop vault. There are no approvals to external contracts. Trading happens inside the collection contract itself.",
    ],
  },
  {
    id: "fees",
    title: "Fees",
    paragraphs: [
      "Every fee is fixed in the contract and flows back to the people who use OriginPad: the creator, the airdrop vault that rewards trading losers, and platform upkeep. No hidden cuts, no oracle-priced surprises.",
    ],
    bullets: [
      "Mint: a flat 0.0003 ETH per NFT, added on top of the creator's mint price and paid to the platform. Not a percentage.",
      "Sell back before bonding: redeeming an NFT to the pool before sellout returns half of its pool share; the other 50% goes to the platform.",
      "NFT marketplace trade: 1.5% of the sale price, split and sent instantly in the same transaction (1% creator, 0.2% platform, 0.2% maintenance, 0.1% airdrop vault). The seller receives the price minus 1.5%. Nothing to claim.",
      "Token swap (Uniswap V4): a creator-set fee of 1.5% to 3.5% in ETH on every buy and sell. It collects in the token's own fee splitter and is released by a permissionless distribute() call (the CLAIM button on the token page) into 66.7% creator, 13.3% platform, 13.3% maintenance, 6.7% airdrop vault.",
      "Airdrop vault: the 0.1% slice from every trade funds the loser airdrops, on top of the token's epoch schedule.",
    ],
  },
];

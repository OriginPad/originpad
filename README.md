# Recomendasi (OriginPad)

NFT × Token launchpad on Base chain. Upload photos, mint 100 NFTs on a bonding curve, then an ERC-20 token auto-deploys on Uniswap V4 (optional per launch). Trade fees flow to creators, platform, maintenance, and an airdrop vault.

Key product features:
- Optional token: at launch the creator toggles "deploy token" on or off. Off means an NFT-only collection (no token, no pool); the bonding pool ETH stays claimable by the creator.
- Variable token fee: when token is on, the creator picks a swap fee from 1.5% (base) up to 3.5%, enforced by a Uniswap V4 hook.
- Reveal timing: rarities are shuffled at sellout and shown instantly, or hidden behind a mystery photo for 24h or 7d.
- Live mint feed, leaderboards by username, and X handle linking via the profile API.

---

## Project Structure

```
recomendasi/
├── contracts/         ← Solidity smart contracts (Hardhat)
│   ├── RecomNFT.sol
│   ├── RecomToken.sol
│   ├── RecomVault.sol
│   ├── RecomTokenFactory.sol
│   ├── RecomLaunchpad.sol
│   └── scripts/deploy.ts
│
├── frontend/          ← Next.js 14 + Tailwind + Wagmi v2
│   └── src/
│       ├── app/
│       │   ├── page.tsx              ← Homepage
│       │   ├── launch/page.tsx       ← 4-step launch form
│       │   ├── explore/page.tsx      ← All collections
│       │   ├── marketplace/page.tsx  ← Post-bonding NFT market
│       │   ├── portfolio/page.tsx    ← User's NFTs/tokens
│       │   ├── collection/[address]/ ← Collection detail + mint
│       │   └── token/[address]/      ← Token detail + vault
│       ├── components/
│       │   ├── layout/Navbar.tsx
│       │   ├── collection/
│       │   │   ├── CollectionCard.tsx
│       │   │   ├── MintButton.tsx
│       │   │   ├── RarityBar.tsx
│       │   │   ├── RarityPreview.tsx
│       │   │   ├── MysteryArt.tsx       ← mystery photo before reveal
│       │   │   ├── LiveMintFeed.tsx     ← who just minted
│       │   │   ├── OwnedPreBondingGrid.tsx
│       │   │   └── NFTGrid.tsx
│       │   ├── token/VaultStatus.tsx
│       │   └── ui/  (LiveTicker, MintCountdown, DateTimePicker)
│       ├── hooks/
│       │   ├── useCollections.ts
│       │   └── useNFTs.ts
│       └── lib/
│           ├── contracts.ts  ← ABIs + addresses
│           ├── wagmi.ts
│           └── ipfs.ts
│
└── backend/           ← Oracle server (Node.js + viem)
    └── oracle/index.ts  ← Indexes trades, submits airdrop lists
```

---

## Quick Start

### 1. Deploy Contracts

```bash
cd contracts
npm install
cp .env.example .env          # fill PRIVATE_KEY + BASESCAN_API_KEY
npm run deploy:testnet         # Base Sepolia
# copy output addresses
```

### 2. Run Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local    # fill in all values
npm run dev
# → http://localhost:3000
```

### 3. Run Oracle

```bash
cd backend
npm install
cp .env.example .env          # fill ORACLE_PRIVATE_KEY + contract addresses
npm start
```

---

## Full Flow

```
User visits /launch
  → Connects wallet (injected / WalletConnect / Coinbase)
  → Fills 4-step form: identity, photos, price, schedule, token toggle
  → Calls RecomLaunchpad.launchCollection()
  → RecomNFT deploys with a flat platform fee = 0.0003 ETH per mint (no oracle)

Mint phase (up to 100 NFTs)
  → Each mint: user pays mintPrice + platformFee
  → Platform fee → treasury
  → Mint price → bonding pool
  → Rarity assigned at sellout (anti-snipe shuffle); shown instantly or after 24h / 7d
  → Pre-bonding sell available with 50% penalty (penalty → platform treasury)

100th mint triggers (only if token was enabled at launch):
  → RecomTokenFactory.deployToken(feeBps)
  → RecomToken deploys (1B supply) + Uniswap V4 pool seeded
  → Swap fee = creator-chosen 1.5%-3.5% (V4 OriginFeeHook)
  → NFT marketplace unlocks (1.5% buy/sell fee)

If token was disabled at launch:
  → No token, no pool; bonding pool ETH stays claimable by the creator

After 24h:
  → Anyone calls RecomToken.lockVault(vaultAddress)
  → 50% supply → RecomVault

Vault epochs (day 1, 7, 14, 28, 56):
  → Oracle indexes trade PnL per address
  → Oracle submits top-100 loser list
  → Anyone calls RecomVault.executeEpoch()
  → 1% airdropped proportionally to losers
  → 9% burned to 0xdead
```

---

## Fee Summary

| Event | Fee | Recipient |
|---|---|---|
| Mint | 0.0003 ETH flat (per NFT) | Platform treasury |
| Mint price | Creator-set (≥0) | Bonding pool |
| Pre-bonding sell | 50% penalty | Platform treasury |
| NFT buy/sell (post-bonding) | 1.5% | See split below |
| Token buy/sell | 1.5%-3.5% (creator-set) | See split below |

**Fee split (proportional, shown for the 1.5% base):**
- 1.0% → creator
- 0.2% → platform treasury
- 0.2% → maintenance (kas)
- 0.1% → airdrop vault

For token swaps the same proportions hold at any fee from 1.5% to 3.5%:
creator 66.7% / platform 13.3% / maintenance 13.3% / airdrop 6.7% of the fee.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Chain | Base (OP Stack L2) |
| Contracts | Solidity 0.8.26, OpenZeppelin v5 (viaIR, cancun) |
| Platform fee | Flat 0.0003 ETH per mint (no oracle dependency) |
| Token DEX | Uniswap V4 (PoolManager + custom fee hook) |
| Frontend | Next.js 14, TypeScript, Tailwind |
| Wallet | Wagmi v2 + viem (injected + WalletConnect + Coinbase) |
| IPFS | Pinata |
| Profile API | Node.js (usernames, X handles, reveal timing) |
| Oracle | Node.js + viem (event indexer) |
| Deployment | Hardhat |

---

## TODO Before Mainnet

- [ ] Full test suite (`contracts/test/`)
- [ ] Subgraph (The Graph) for efficient event indexing (current getLogs is capped to ~45k blocks)
- [ ] Rate limiting on /launch (prevent spam collections)
- [ ] Multisig for platform treasury
- [ ] Rotate all keys before mainnet (oracle PK, deployer PK, Pinata JWT, GitHub PAT)
- [ ] Security audit
- [ ] Oracle redundancy (multiple nodes)

# OriginPad Litepaper

The launchpad built so you cannot get rugged.

OriginPad is an NFT x Token launchpad on Base. Creators upload art, mint out a
100-NFT bonding curve, and an ERC-20 token deploys automatically with its
liquidity locked. Every mechanism that is normally used to rug a launch is either
removed or hard-coded on-chain.

---

## 1. The problem

Most token and NFT launches fail the same handful of ways:

- Liquidity rug pulls: the team pulls the pool and the token goes to zero.
- Team allocations dumped on holders in week one.
- Rarity sniping: bots mint the rares before real users can.
- Allowlist bypasses and bot-flooded public mints.
- Malicious marketplace approvals draining wallets.
- Mint proceeds vanishing before the launch even finishes.

OriginPad closes each of these at the contract level, not with promises.

## 2. How it works

1. **Launch.** A creator calls the launchpad with their art (3-6 photos, one per
   rarity tier), mint price, optional token, and up to four allowlist phases
   (team, guaranteed, FCFS, public) with on-chain merkle roots.
2. **Mint.** 100 NFTs mint on a bonding curve. Each mint price feeds a pool.
   Rarity is assigned only at sellout, from a block mined after the final mint,
   so the last minter cannot grind for the Mythic.
3. **Bond.** The 100th mint triggers the token factory. An ERC-20 (1B supply)
   deploys and a Uniswap V4 pool opens with liquidity seeded from the bonding
   pool and locked.
4. **Trade.** The built-in NFT marketplace unlocks, and the token trades on the
   V4 pool through an in-app swap. No external approvals.
5. **Reward.** Trading losers are rewarded over time from protocol fees and a
   fixed vault schedule.

## 3. Anti-rug mechanisms

- **Locked liquidity.** Pool liquidity is locked at bonding. The team cannot
  withdraw it.
- **No admin kill-switch.** There is no pause, blacklist, freeze, or mint-more
  function. The same property that means nobody can rug also means nobody,
  including the team, can censor a wallet on-chain.
- **Hard-coded vault schedule.** 50% of token supply is held by the vault and
  released on a fixed day 1/7/14/28/56 schedule. Nobody can skip a burn or
  redirect an airdrop.
- **Anti-snipe reveal.** Rarity is drawn from a future block at sellout. Creators
  can also delay the art reveal (instant, 24h, or 7d) behind a mystery image.
- **On-chain allowlists.** Phases are enforced by merkle proofs, not a backend.

## 4. Tokenomics

- **Supply:** 1,000,000,000 per token, fixed.
- **50% to holders/market:** seeds the locked V4 pool at bonding.
- **50% to the vault:** released across five epochs (days 1, 7, 14, 28, 56).
  Each epoch burns 9% of supply and routes 1% into a claim pool for that token's
  trading losers. The 9% burn is permanent. The 1% is never burned. Over the full
  schedule that is 45% burned and 5% put up for claiming.
- **Timing:** the first epoch fires about two days after sellout. lockVault
  becomes callable roughly 24 hours after the token deploys, and the day-1 epoch
  matures about 24 hours after lock.

## 5. Fees

Every fee is fixed in the contract and flows back to the people who use the
platform: the creator, the airdrop vault, and platform upkeep.

| Action | Fee | Where it goes |
|---|---|---|
| Mint | 0.0003 ETH flat per NFT | Platform |
| Sell back before bonding | 50% of pool share | Platform |
| NFT marketplace trade | 1.5% of sale, paid instantly | 1% creator, 0.2% platform, 0.2% maintenance, 0.1% airdrop vault |
| Token swap (V4) | 1.5%-3.5% in ETH, creator-set | 66.7% creator, 13.3% platform, 13.3% maintenance, 6.7% airdrop vault |

Token swap fees collect in a per-token splitter and are released by a
permissionless `distribute()` call, shown as claimable on the token page. NFT
trade fees are split and paid out instantly in the same transaction.

## 6. Loser rewards

A loser is any wallet with a net ETH loss of at least 0.001 ETH on a token,
measured across both venues combined: the NFT marketplace and the token pool. The
top 100 by loss share each day's allocation. The oracle snapshots daily at 23:30
UTC, so trades in the final 30 minutes count toward the next day instead.

Two reward streams:

- **Epoch tokens (finite):** the 1%-per-epoch token allocation from the vault,
  over the five-epoch schedule.
- **Trade fees (continuous):** the 0.1% airdrop slice from every trade. For
  collections without a token it is claimed as ETH; for collections with a token
  the protocol uses it for a daily buyback and the bought tokens are claimed by
  losers, adding buy pressure instead of depleting any reserve.

Rewards are claim-based and cumulative: each day's allocation is published as a
merkle root in the AirdropDistributor contract, and eligible wallets claim their
own share whenever they want. Allocations never expire, nothing is clawed back or
burned, and anything not yet allocated rolls over to the next day's losers. The
Airdrops page shows a Claim button per token plus Claim all. The platform never
pushes gas to hundreds of addresses, and the 0.001 ETH minimum loss keeps
dust-wallet farming out.

## 7. Security

- No admin kill-switch, no upgradable proxy on the core flow.
- Marketplace runs inside the collection contract, so there are no external
  token approvals to drain.
- Contracts are reviewed (manual + static analysis) before each deploy. A formal
  third-party audit is planned before mainnet.

## 8. Status and roadmap

- **Now:** live on Base Sepolia testnet for a public feedback period, with
  claim-based loser rewards (cumulative merkle, daily snapshot) live.
- **Next:** the continuous fee buyback stream, then a formal audit.
- **Mainnet:** after the audit and key rotation.

---

This document describes the protocol design. The claim-based epoch airdrop runs
on testnet today. The continuous fee-buyback stream is the remaining piece of the
loser-reward design and ships with the audited mainnet contracts.

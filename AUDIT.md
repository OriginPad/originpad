# Security Audit — OriginPad

This document records the security review of the OriginPad smart contracts prior to
mainnet deployment. The review was performed **in-house** (self-audit), not by an
external firm — see [Disclaimer](#disclaimer).

- **Chain:** Base
- **Contracts:** `RecomLaunchpad`, `RecomNFT` (ERC-1155 + built-in marketplace),
  `RecomTokenFactory`, `RecomToken`, `RecomVault`, `AirdropDistributor`,
  `OriginFeeHook`, `OriginFeeSplitter`, `OriginSwapRouter`, `RecomNFTDeployer`
- **Compiler:** Solidity 0.8.26, optimizer `runs: 1`, `viaIR`, revert strings stripped
  (to keep `RecomNFT` under the EIP-170 24 KB limit)

## Methodology

1. **Static analysis** — Slither 0.11.5 across all core contracts.
2. **AI-assisted review** — an LLM (Claude Opus 4.8) reasoning over the full source
   against a smart-contract security knowledge base (reentrancy, fund-flow,
   access control, randomness, MEV, accounting).
3. **Independent re-audit** — a second, separate LLM pass reviewing only the changed
   code with no prior context, to catch issues the author missed.
4. **End-to-end validation** — a fresh deployment to Base Sepolia exercising every
   user flow on-chain (launch → mint → bond → reveal → marketplace → swap → fee
   distribution → claim).

## Findings & resolutions

All findings below were identified and addressed before mainnet.

| ID | Area | Severity | Status |
|----|------|----------|--------|
| S1 | `RecomNFT` rarity reveal was grindable — the seed mixed `block.prevrandao`, which varies per block, and reveal is permissionless, so a minter could retry until a favorable tier appeared | High | **Fixed** — seed is now drawn from a *fixed future block hash* (`blockhash(bondingBlock + REVEAL_DELAY)`), unknowable at sellout and identical regardless of when reveal is triggered; re-anchors if it ages past the 256-block window so it never collapses to a predictable constant |
| S2 | `OriginFeeSplitter` creator buyback used `minOut = 0` (MEV sandwich) | Medium | **Fixed** — `distribute(uint256 minCreatorOut)` overload lets the oracle supply an off-chain slippage floor; the permissionless `distribute()` keeps an ETH fallback |
| S3 | `AirdropDistributor.setRoot` has no on-chain cap vs. funded amount | Medium | **No change (by design)** — claims are already bounded by the distributor's token balance (`safeTransfer` reverts on shortfall); a `totalFunded` cap would break the balance-based funding model. Residual trust in the oracle key is mitigated operationally (fresh, isolated mainnet oracle key) |
| S4 | Fee/sale payouts used `require(success)` on each push; a single reverting recipient could brick a mint/sale | Medium | **Fixed** — `_payOrCredit` credits a pull balance (`pendingWithdrawals` / `withdrawPending`) on push failure; `withdrawEmergency` excludes both offer escrow and pending balances |
| S5 | `RecomNFTDeployer.deployNFT` had no caller auth (orphan/spoofed collections) | Low | **Fixed** — `require(msg.sender == launchpad)`, with `setLaunchpad` set once |
| S6 | `acceptCollectionOffer` consumed the offerer's full deposited budget for one NFT | Low | **Fixed** — takes an agreed sale price and refunds the unused budget |
| S7 | Collection offers had no expiry (stale offers acceptable at old prices) | Low | **Fixed** — per-offer `offerExpiry`; `makeCollectionOffer(duration)`, capped at 30 days |
| S8 | `CurrencySettler` was imported from `@uniswap/v4-core/test/` (no stability guarantee) | Low | **Fixed** — vendored into `contracts/lib/CurrencySettler.sol` (logic byte-identical, imports only) |
| **F-8** | `setLaunchpad` was unauthenticated first-write-wins — a front-runner could set the launchpad first and brick/spoof the deployer | Medium | **Fixed** — `immutable owner` (constructor `msg.sender`) + `require(msg.sender == owner)`; found by the independent re-audit |

### Reviewed and accepted (not fixed)

- **`_completeBonding` fallback** — on V4 pool-creation failure the bonding `try/catch`
  deploys a token without a pool. Solidity `try/catch` is atomic, so there is no
  double-deploy and no fund loss (the pool seed is preserved for the creator). This is
  intentional graceful degradation; falling back to "no token" would drop stream-1
  airdrops, so it was kept.
- **Splitter `distribute()` push to platform/kas/airdrop** — uses `require` on send.
  These are platform-controlled addresses, so the brick risk is operational only (Low).

### Off-chain (API) findings — earlier pass

- **O1 (Medium)** `/api/collection/meta` was unauthenticated → fixed with EIP-191
  signature verification (signer must be the on-chain creator) + URL scheme validation.
- **O2/O3 (Low)** airdrop snapshot secret + bonded-status endpoint hardened.

## Features shipped with the bundle

- **F1** anti-sniper fee decay (80% → base fee over a creator-set window)
- **F2** creator fee delivery choice (ETH / token buyback / both)
- **F4** `buyMany` — sweep several listed NFTs in one atomic transaction

## On-chain end-to-end validation (Base Sepolia)

A fresh deployment of the audited bundle was exercised end-to-end:

| Flow | Result |
|------|--------|
| Deploy + wiring assertion | Pass |
| Launch collection (S5 auth) | Pass |
| Mint + platform fee (S4) | Pass |
| Bond → token deploy + V4 pool (S8) | Pass |
| Rarity reveal (S1) | Pass |
| `buyMany` sweep (F4) | Pass |
| Sale payouts (S4) | Pass |
| Collection offer: agreed price + refund + expiry (S6/S7) | Pass |
| Swap → fee → `distribute(minOut)` → vault (S2) | Pass |
| F-8 owner-check: non-owner `setLaunchpad` rejected | Pass |

Stream-1 (9% burn + 1% airdrop) and the merkle claim flow were validated in a prior
deployment; `RecomToken` / `RecomVault` / `AirdropDistributor` were **not changed** in
this bundle.

## Disclaimer

This is an **in-house self-audit**, not a formal third-party audit. It combines static
analysis, AI-assisted review, an independent second pass, and on-chain end-to-end
testing. It does **not** guarantee the absence of vulnerabilities. There is no formal
unit-test suite. Use at your own risk; review the code yourself before interacting with
real funds.

_Last updated: 2026-06-21._

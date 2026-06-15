// backend/oracle/index.ts
// Standalone Node.js oracle server
// - Indexes NFTSold and token transfer events on Base
// - Tracks PnL per address per collection
// - Submits top-100 loser list to RecomVault before each epoch
// Run: ts-node backend/oracle/index.ts

import { createPublicClient, createWalletClient, http, parseAbi, formatEther, keccak256, encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────
const IS_TESTNET = process.env.CHAIN === "testnet";
const CHAIN = IS_TESTNET ? baseSepolia : base;
const RPC = IS_TESTNET ? "https://sepolia.base.org" : "https://mainnet.base.org";

const ORACLE_PK = process.env.ORACLE_PRIVATE_KEY as `0x${string}`;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as `0x${string}`;
const LAUNCHPAD_ADDRESS = process.env.LAUNCHPAD_ADDRESS as `0x${string}`;

// Uniswap V4: token pools are native-ETH / TOKEN, fee 0, tickSpacing 60, with our hook
const POOL_MANAGER = (process.env.POOL_MANAGER || "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408") as `0x${string}`;
const FEE_HOOK = (process.env.FEE_HOOK || "0x0000000000000000000000000000000000000000") as `0x${string}`;

// poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
function poolIdFor(token: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    ["0x0000000000000000000000000000000000000000", token, 0, 60, FEE_HOOK]
  ));
}

// Where to publish the loser standing so the app can show eligibility
const PROFILE_API = process.env.PROFILE_API_URL || "http://127.0.0.1:3001";
const AIRDROP_SECRET = process.env.AIRDROP_SECRET || "";

const account = privateKeyToAccount(ORACLE_PK);

const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: CHAIN, transport: http(RPC) });

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const NFT_SOLD_ABI = parseAbi([
  "event NFTSold(uint256 indexed tokenId, uint256 price, address from, address to)",
]);

const VAULT_ABI = parseAbi([
  "function submitAirdropRecipients(address token, uint256 epochIndex, address[] recipients, uint256[] amounts) external",
  "function executeEpoch(address token, uint256 epochIndex) external",
  "function getVaultStatus(address token) external view returns (uint256 balance, uint256[5] executed, uint256[5] epochTimes, bool[5] ready)",
  "function getManagedTokens() external view returns (address[])",
  "function notifyDeployment(address token, address creator) external",
]);

const TOKEN_ABI = parseAbi([
  "function totalSupply() external view returns (uint256)",
  "function dexPair() external view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// Uniswap V3 pool Swap event (amounts are signed, from the pool's perspective)
const SWAP_EVENT = {
  type: "event", name: "Swap", inputs: [
    { name: "sender", type: "address", indexed: true },
    { name: "recipient", type: "address", indexed: true },
    { name: "amount0", type: "int256", indexed: false },
    { name: "amount1", type: "int256", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false },
  ],
} as const;

// WETH on Base (same address mainnet + sepolia)
const WETH9 = "0x4200000000000000000000000000000000000006".toLowerCase();
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// Uniswap V4 PoolManager Swap event (id indexed so we can filter by poolId)
const V4_SWAP_EVENT = {
  type: "event", name: "Swap", inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "amount0", type: "int128", indexed: false },
    { name: "amount1", type: "int128", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false },
    { name: "fee", type: "uint24", indexed: false },
  ],
} as const;

const LAUNCHPAD_ABI = parseAbi([
  "function getAllCollections() external view returns (address[])",
  "event CollectionLaunched(address indexed collection, address indexed creator, string name, string ticker, uint256 mintPrice, uint256 mintStart)",
]);

const NFT_ABI_FULL = [{
  name: "getCollectionInfo", type: "function", stateMutability: "view", inputs: [],
  outputs: [{ name: "", type: "tuple", components: [
    { name: "name", type: "string" }, { name: "ticker", type: "string" },
    { name: "bio", type: "string" }, { name: "socialX", type: "string" },
    { name: "socialGithub", type: "string" }, { name: "socialFarcaster", type: "string" },
    { name: "photoURIs", type: "string[6]" }, { name: "photoCount", type: "uint8" },
    { name: "creator", type: "address" }, { name: "mintPrice", type: "uint256" },
    { name: "platformFeeETH", type: "uint256" }, { name: "bondingComplete", type: "bool" },
    { name: "tokenAddress", type: "address" },
  ]}],
}] as const;

// ─── In-memory state ──────────────────────────────────────────────────────────
// token address => address => { spent, received } in ETH
const tradeState: Record<
  string,
  Record<string, { spent: bigint; received: bigint }>
> = {};

// ─── Index trade events ───────────────────────────────────────────────────────

async function indexCollectionTrades(collectionAddress: `0x${string}`) {
  console.log(`[oracle] Indexing trades for ${collectionAddress}`);

  // Get the token address for this collection
  const info = await publicClient.readContract({
    address: collectionAddress,
    abi: NFT_ABI_FULL,
    functionName: "getCollectionInfo",
  }) as any;

  const tokenAddr = info.tokenAddress as `0x${string}`;
  if (!tokenAddr || tokenAddr === ZERO_ADDR) return;

  // Reset to a clean snapshot: we re-read all logs from earliest every run, so
  // start fresh to avoid double-counting cumulative history across runs.
  tradeState[tokenAddr] = {};

  // Index NFT buy/sell events
  const nftLogs = await publicClient.getLogs({
    address: collectionAddress,
    event: NFT_SOLD_ABI[0],
    fromBlock: "earliest",
  });

  for (const log of nftLogs) {
    const { price, from, to } = log.args as any;
    if (!tradeState[tokenAddr][from]) {
      tradeState[tokenAddr][from] = { spent: BigInt(0), received: BigInt(0) };
    }
    if (!tradeState[tokenAddr][to]) {
      tradeState[tokenAddr][to] = { spent: BigInt(0), received: BigInt(0) };
    }
    // Seller received
    tradeState[tokenAddr][from].received += price;
    // Buyer spent
    tradeState[tokenAddr][to].spent += price;
  }

  // Index token DEX trades (Uniswap V4 swaps on the PoolManager, filtered by
  // poolId), combined into the same loser list as NFT trades. amount0 is the
  // ETH (currency0) delta from the swapper's perspective:
  //   amount0 < 0  => trader paid ETH (bought token)  => spent
  //   amount0 > 0  => trader received ETH (sold token) => received
  let swapCount = 0;
  const poolId = poolIdFor(tokenAddr);
  const swapLogs = await publicClient.getLogs({
    address: POOL_MANAGER,
    event: V4_SWAP_EVENT,
    args: { id: poolId },
    fromBlock: "earliest",
  }).catch(() => [] as any[]);
  swapCount = swapLogs.length;

  // The Swap event's sender is the router, so resolve the real trader from the
  // tx sender. Cache per tx to limit RPC calls.
  const txFrom: Record<string, `0x${string}`> = {};
  for (const log of swapLogs) {
    const { amount0 } = (log as any).args;
    const eth: bigint = amount0;
    if (eth === BigInt(0)) continue;

    const txHash = (log as any).transactionHash as string;
    let trader = txFrom[txHash];
    if (!trader) {
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      trader = tx.from;
      txFrom[txHash] = trader;
    }

    if (!tradeState[tokenAddr][trader]) {
      tradeState[tokenAddr][trader] = { spent: BigInt(0), received: BigInt(0) };
    }
    if (eth < BigInt(0)) tradeState[tokenAddr][trader].spent += -eth;
    else tradeState[tokenAddr][trader].received += eth;
  }

  console.log(`[oracle] ${nftLogs.length} NFT trades, ${swapCount} token swaps indexed`);
}

// ─── Compute top losers ───────────────────────────────────────────────────────

// Wallets barred from airdrop (e.g. flagged for cheating). Refreshed from the
// profile API before each list build so the 23:30 UTC snapshot freezes the
// latest exclusions. Filtered out BEFORE the top-100 cut so a banned wallet
// never takes a slot from a legitimate loser.
let excludedSet = new Set<string>();
async function refreshExcluded() {
  try {
    const r = await fetch(`${PROFILE_API}/api/moderation`);
    if (r.ok) {
      const d: any = await r.json();
      excludedSet = new Set((d.excluded || []).map((a: string) => String(a).toLowerCase()));
    }
  } catch {}
}

function computeLosers(
  tokenAddr: string,
  topN = 100
): { address: `0x${string}`; loss: bigint }[] {
  const state = tradeState[tokenAddr];
  if (!state) return [];

  return Object.entries(state)
    .map(([address, { spent, received }]) => ({
      address: address as `0x${string}`,
      loss: spent > received ? spent - received : BigInt(0), // net loss in ETH
    }))
    .filter((e) => e.loss > BigInt(0))
    .filter((e) => !excludedSet.has(e.address.toLowerCase()))
    .sort((a, b) => (b.loss > a.loss ? 1 : -1))
    .slice(0, topN);
}

// ─── Build airdrop list (shared by submit + publish) ──────────────────────────
// Airdrop = 1% of total supply per epoch, split proportionally to ETH loss.

async function buildAirdropList(tokenAddr: `0x${string}`) {
  await refreshExcluded(); // pull the latest airdrop ban list before building
  const totalSupply = await publicClient.readContract({
    address: tokenAddr, abi: TOKEN_ABI, functionName: "totalSupply",
  }) as bigint;

  const airdropTotal = (totalSupply * BigInt(100)) / BigInt(10000); // 1%
  const losers = computeLosers(tokenAddr, 100);
  const totalLoss = losers.reduce((sum, l) => sum + l.loss, BigInt(0));

  const recipients: `0x${string}`[] = [];
  const amounts: bigint[] = [];
  for (const loser of losers) {
    recipients.push(loser.address);
    amounts.push(totalLoss > BigInt(0) ? (airdropTotal * loser.loss) / totalLoss : BigInt(0));
  }
  return { recipients, amounts, losers, totalLoss, airdropTotal };
}

// ─── Publish standing to the app API (eligibility preview) ────────────────────

async function publishStanding(
  tokenAddr: `0x${string}`,
  frozen = false,
  epochIndex?: number
) {
  const { recipients, amounts, losers, totalLoss } = await buildAirdropList(tokenAddr);
  const body = {
    token: tokenAddr,
    totalLoss: totalLoss.toString(),
    frozen,
    epochIndex,
    recipients: recipients.map((address, i) => ({
      address,
      amount: amounts[i].toString(),
      loss: losers[i].loss.toString(),
    })),
  };
  try {
    const res = await fetch(`${PROFILE_API}/api/airdrop/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-oracle-secret": AIRDROP_SECRET },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[oracle] publishStanding ${tokenAddr} HTTP ${res.status}`);
  } catch (err) {
    console.error(`[oracle] publishStanding ${tokenAddr} failed:`, err);
  }
}

async function publishAllStandings() {
  const managedTokens = await publicClient.readContract({
    address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "getManagedTokens",
  }) as `0x${string}`[];
  for (const tokenAddr of managedTokens) {
    await publishStanding(tokenAddr, false);
  }
}

// ─── Submit airdrop for epoch ─────────────────────────────────────────────────

async function submitAirdropEpoch(tokenAddr: `0x${string}`, epochIndex: number) {
  console.log(`[oracle] Submitting airdrop for token ${tokenAddr} epoch ${epochIndex}`);

  const { recipients, amounts, airdropTotal } = await buildAirdropList(tokenAddr);

  if (recipients.length === 0) {
    console.log(`[oracle] No losers found, skipping airdrop submission`);
    return;
  }

  // Submit to vault (frozen cutoff list for this epoch)
  const hash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "submitAirdropRecipients",
    args: [tokenAddr, BigInt(epochIndex), recipients, amounts],
  });

  console.log(`[oracle] Submitted epoch ${epochIndex} airdrop — tx: ${hash}`);
  console.log(`[oracle] Recipients: ${recipients.length}, Total: ${formatEther(airdropTotal)} tokens`);

  // Archive the same frozen list to the app API for eligibility lookups
  await publishStanding(tokenAddr, true, epochIndex);
}

// ─── Snapshot (23:30 UTC) ─────────────────────────────────────────────────────
// Freeze the loser list and submit recipients on-chain for every epoch that
// matures before the upcoming 00:00 UTC distribution. The data indexed up to
// this moment is the official cutoff; nothing after counts for this epoch.

async function snapshotEpochs() {
  console.log("[oracle] === SNAPSHOT 23:30 UTC ===");
  // Refresh trade data so the snapshot reflects state right up to the cutoff
  await indexAllCollections();

  // Timestamp (sec) of the upcoming 00:00 UTC distribution
  const cutoffSec = BigInt(Math.floor((Date.now() + msUntilUTC(0, 0)) / 1000));

  const managedTokens = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getManagedTokens",
  }) as `0x${string}`[];

  for (const tokenAddr of managedTokens) {
    const [, executed, epochTimes] = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getVaultStatus",
      args: [tokenAddr],
    }) as any[];

    for (let i = 0; i < 5; i++) {
      // Submit if not yet executed and the epoch matures by the next 00:00 UTC
      if (executed[i] === BigInt(0) && (epochTimes[i] as bigint) <= cutoffSec) {
        console.log(`[oracle] Snapshotting epoch ${i} for ${tokenAddr}`);
        try {
          await submitAirdropEpoch(tokenAddr, i);
        } catch (err) {
          console.error(`[oracle] Failed to snapshot epoch ${i}:`, err);
        }
      }
    }
  }
}

// ─── Distribution (00:00 UTC) ─────────────────────────────────────────────────
// Execute every epoch that is now ready. executeEpoch burns 9% and airdrops the
// 1% to the recipients frozen at the 23:30 snapshot.

async function distributeEpochs() {
  console.log("[oracle] === DISTRIBUTION 00:00 UTC ===");
  const managedTokens = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getManagedTokens",
  }) as `0x${string}`[];

  for (const tokenAddr of managedTokens) {
    const [, executed, , ready] = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getVaultStatus",
      args: [tokenAddr],
    }) as any[];

    for (let i = 0; i < 5; i++) {
      if (ready[i] && executed[i] === BigInt(0)) {
        console.log(`[oracle] Executing epoch ${i} for ${tokenAddr}`);
        try {
          const hash = await walletClient.writeContract({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: "executeEpoch",
            args: [tokenAddr, BigInt(i)],
          });
          console.log(`[oracle] Executed epoch ${i} for ${tokenAddr} — tx: ${hash}`);
        } catch (err) {
          console.error(`[oracle] Failed to execute epoch ${i}:`, err);
        }
      }
    }
  }
}

// ─── Daily UTC scheduler ──────────────────────────────────────────────────────

// Milliseconds from now until the next occurrence of hour:minute UTC
function msUntilUTC(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0
  ));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

// Run `job` every day at hour:minute UTC, rescheduling itself after each run
function scheduleDaily(hour: number, minute: number, label: string, job: () => Promise<void>) {
  const delay = msUntilUTC(hour, minute);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  console.log(`[oracle] Next ${label} at ${hh}:${mm} UTC in ${Math.round(delay / 60000)} min`);
  setTimeout(async () => {
    try {
      await job();
    } catch (err) {
      console.error(`[oracle] ${label} run failed:`, err);
    }
    scheduleDaily(hour, minute, label, job);
  }, delay);
}

async function indexAllCollections() {
  const collections = await publicClient.readContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: "getAllCollections",
  }) as `0x${string}`[];

  for (const col of collections) {
    try {
      await indexCollectionTrades(col);
    } catch (err) {
      // Collection may not be bonded yet
    }
  }
}

async function main() {
  console.log("[oracle] Starting Recomendasi oracle...");
  console.log(`[oracle] Chain: ${CHAIN.name}`);
  console.log(`[oracle] Vault: ${VAULT_ADDRESS}`);
  console.log(`[oracle] Oracle: ${account.address}`);

  // Initial index
  await indexAllCollections();

  // Publish an initial standing so the app has data right away
  await publishAllStandings().catch((e) => console.error("[oracle] initial publish failed:", e));

  // Keep trade data warm + refresh the eligibility standing every 5 min
  // (no submit/execute here, the 23:30 snapshot is the cutoff)
  setInterval(async () => {
    try {
      await indexAllCollections();
      await publishAllStandings();
    } catch (err) {
      console.error("[oracle] Indexing run failed:", err);
    }
  }, 5 * 60 * 1000);

  // Daily epoch rhythm: snapshot losers at 23:30 UTC, distribute at 00:00 UTC
  scheduleDaily(23, 30, "snapshot", snapshotEpochs);
  scheduleDaily(0, 0, "distribution", distributeEpochs);

  // Also watch for new collections in real-time
  publicClient.watchContractEvent({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    eventName: "CollectionLaunched",
    onLogs: async (logs) => {
      for (const log of logs) {
        console.log(`[oracle] New collection: ${(log as any).args.collection}`);
      }
    },
  });

  console.log("[oracle] Running. Snapshot 23:30 UTC, distribution 00:00 UTC daily.");
}

main().catch(console.error);

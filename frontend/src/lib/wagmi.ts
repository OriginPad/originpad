import { createConfig, http, fallback } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const projectId = "b2c4aba99b034aae1fe833eea7b1a9a4";

// Only register the chain the app is actually deployed on. During the testnet
// phase this is Base Sepolia ONLY, so a wallet on Base mainnet (or anywhere
// else) can never read/write against contracts that do not exist there. The
// NetworkGuard prompts users on any other chain to switch.
const IS_TESTNET = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532) === baseSepolia.id;
const activeChains = IS_TESTNET ? ([baseSepolia] as const) : ([base] as const);

export const wagmiConfig = createConfig({
  chains: activeChains,
  connectors: [
    injected(),
    walletConnect({ projectId, showQrModal: true }),
    coinbaseWallet({ appName: "OriginPad" }),
  ],
  transports: {
    [base.id]: http("https://mainnet.base.org"),
    // drpc supports filtered eth_getLogs up to ~10k blocks (needed for live mint +
    // leaderboard indexing). publicnode's getLogs is BROKEN ("Invalid parameters"),
    // and sepolia.base.org caps getLogs low — both kept only as write/read fallback.
    [baseSepolia.id]: fallback([
      http("https://base-sepolia.drpc.org"),
      http("https://sepolia.base.org"),
      http("https://base-sepolia-rpc.publicnode.com"),
    ]),
  },
});

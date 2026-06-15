import { createConfig, http, fallback } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const projectId = "b2c4aba99b034aae1fe833eea7b1a9a4";

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected(),
    walletConnect({ projectId, showQrModal: true }),
    coinbaseWallet({ appName: "OriginPad" }),
  ],
  transports: {
    [base.id]: http("https://mainnet.base.org"),
    // publicnode supports getLogs (needed for live mint + leaderboard indexing);
    // sepolia.base.org rejects getLogs, so it is only a write/read fallback.
    [baseSepolia.id]: fallback([
      http("https://base-sepolia-rpc.publicnode.com"),
      http("https://sepolia.base.org"),
    ]),
  },
});

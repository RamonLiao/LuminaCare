import type { PrivyClientConfig } from "@privy-io/react-auth";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

const RPC_HTTP =
  process.env.NEXT_PUBLIC_RPC_PRIMARY ||
  process.env.NEXT_PUBLIC_RPC_FALLBACK ||
  "https://api.devnet.solana.com";

// derive a websocket URL from the http one (Helius supports wss on same host)
const RPC_WS = RPC_HTTP.replace(/^http/, "ws");

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "light",
    accentColor: "#0ea5e9",
  },
  embeddedWallets: {
    solana: { createOnLogin: "users-without-wallets" },
  },
  solana: {
    rpcs: {
      "solana:devnet": {
        rpc: createSolanaRpc(RPC_HTTP),
        rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS),
        blockExplorerUrl: "https://solscan.io/?cluster=devnet",
      },
    },
  },
};

import { Connection, clusterApiUrl } from "@solana/web3.js";

let cached: Connection | null = null;

export function getConnection(): Connection {
  if (cached) return cached;
  const primary = process.env.NEXT_PUBLIC_RPC_PRIMARY;
  const fallback = process.env.NEXT_PUBLIC_RPC_FALLBACK ?? clusterApiUrl("devnet");
  cached = new Connection(primary || fallback, { commitment: "confirmed" });
  return cached;
}

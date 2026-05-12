import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getConnection } from "./connection";

const MIN_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

export class InsufficientFundsError extends Error {
  constructor(public address: string, public balance: number) {
    super(
      `Insufficient balance (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). ` +
        `Please ask an administrator to top up address ${address}.`,
    );
    this.name = "InsufficientFundsError";
  }
}

export async function assertSufficientBalance(address: string): Promise<void> {
  const conn = getConnection();
  const balance = await conn.getBalance(new PublicKey(address), "confirmed");
  if (balance < MIN_LAMPORTS) {
    throw new InsufficientFundsError(address, balance);
  }
}

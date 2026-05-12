import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { ConnectedStandardSolanaWallet } from "@privy-io/js-sdk-core";
import type { PrivySolWallet } from "./client";

// Force devnet for every Privy sign/simulate; otherwise SDK defaults to mainnet
// and Privy's pre-flight simulation hits api.mainnet-beta.solana.com → 403.
const CHAIN = "solana:devnet";

export function adaptPrivyWallet(w: ConnectedStandardSolanaWallet): PrivySolWallet {
  async function signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const serialized = tx.serialize({ requireAllSignatures: false } as Parameters<typeof tx.serialize>[0]);
    const output = await w.signTransaction({ transaction: serialized, chain: CHAIN });
    const signed = output.signedTransaction;
    if (tx instanceof VersionedTransaction) {
      return VersionedTransaction.deserialize(signed) as T;
    }
    return Transaction.from(signed) as T;
  }

  async function signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => signTransaction(tx)));
  }

  return { address: w.address, signTransaction, signAllTransactions };
}

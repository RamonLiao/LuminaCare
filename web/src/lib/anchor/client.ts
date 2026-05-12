import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { IDL } from "./types";
import { getConnection } from "@/lib/solana/connection";

// IDL has top-level `address` field (Anchor 0.30+/1.0 format); Program reads it automatically.
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);

export type PrivySolWallet = {
  address: string;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

function adaptWallet(w: PrivySolWallet): Wallet {
  return {
    publicKey: new PublicKey(w.address),
    signTransaction: w.signTransaction,
    signAllTransactions: w.signAllTransactions,
    // `payer` exists on the Wallet interface but is never used by AnchorProvider internals;
    // cast avoids needing a real Keypair here.
    payer: undefined as never,
  };
}

// @coral-xyz/anchor 0.32.x: Program constructor is (idl, provider?) — 2-arg, no programId.
// Program reads the program address from IDL.address automatically.
export function getProgram(wallet: PrivySolWallet) {
  const provider = new AnchorProvider(getConnection(), adaptWallet(wallet), {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

// seeds = [b"record", patient.key().as_ref(), &version.to_le_bytes()]
// Matches anchor_record.rs line 15.
export function recordPda(patient: PublicKey, version: number): [PublicKey, number] {
  const versionLE = Buffer.alloc(4);
  versionLE.writeUInt32LE(version, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("record"), patient.toBuffer(), versionLE],
    PROGRAM_ID,
  );
}

// seeds = [GRANT_SEED, patient.key().as_ref(), &grant_id]
// Matches issue_grant.rs line 16. grant_id is a raw byte slice (e.g. 16-byte UUID).
export function grantPda(patient: PublicKey, grantId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("grant"), patient.toBuffer(), Buffer.from(grantId)],
    PROGRAM_ID,
  );
}

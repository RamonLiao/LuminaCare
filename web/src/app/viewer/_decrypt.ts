import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import { getConnection } from "@/lib/solana/connection";
import { grantPda } from "@/lib/anchor/client";
import { IDL } from "@/lib/anchor/types";
import { decrypt, importKey, fromBase64 } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import type { QrPayloadV1 } from "@/lib/qr/payload";

export type DecryptedRecord = {
  kind: "text" | "photo" | "audio";
  text?: string;
  url?: string;
  createdAt: number;
  tampered: boolean;
};

function readonlyProgram() {
  const dummy: Wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    payer: undefined as never,
  };
  const provider = new AnchorProvider(getConnection(), dummy, { commitment: "confirmed" });
  return new Program(IDL, provider);
}

export async function decryptGrant(p: QrPayloadV1, onProgress: (msg: string) => void): Promise<DecryptedRecord[]> {
  const patient = new PublicKey(p.patientPubkey);
  const grantIdBytes = new Uint8Array(p.grantId.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const [grantPdaAddr] = grantPda(patient, grantIdBytes);
  const program = readonlyProgram();

  onProgress("查詢授權狀態…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grant = (await (program.account as any).accessGrant.fetch(grantPdaAddr)) as {
    revoked: boolean; expiresAt: { toNumber(): number };
  };
  if (grant.revoked) throw new Error("此授權已撤銷");
  if (grant.expiresAt.toNumber() * 1000 < Date.now()) throw new Error("此授權已到期");

  onProgress("下載授權包…");
  const bundleCipher = await fetch(p.bundleUrl).then((r) => r.arrayBuffer());
  const bundleKey = await importKey(fromBase64(p.bundleKey).buffer as ArrayBuffer);
  const bundlePlain = await decrypt(bundleCipher, bundleKey, fromBase64(p.bundleIv));
  const bundle = JSON.parse(new TextDecoder().decode(bundlePlain)) as {
    records: Array<{ blobUrl: string; aesKey: string; iv: string; kind: "text"|"photo"|"audio"; createdAt: number; pdaAddress: string }>;
  };

  const out: DecryptedRecord[] = [];
  for (const r of bundle.records) {
    onProgress(`解密第 ${out.length + 1} / ${bundle.records.length} 筆…`);
    const cipher = await fetch(r.blobUrl).then((res) => res.arrayBuffer());
    const calcHash = await sha256(cipher);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChain = (await (program.account as any).healthRecord.fetch(new PublicKey(r.pdaAddress))) as { contentHash: number[] };
    const tampered = !arraysEqual(calcHash, Uint8Array.from(onChain.contentHash));

    const key = await importKey(fromBase64(r.aesKey).buffer as ArrayBuffer);
    const plain = await decrypt(cipher, key, fromBase64(r.iv));

    if (r.kind === "text") {
      out.push({ kind: "text", text: new TextDecoder().decode(plain), createdAt: r.createdAt, tampered });
    } else {
      const blob = new Blob([plain], { type: r.kind === "photo" ? "image/*" : "audio/*" });
      out.push({ kind: r.kind, url: URL.createObjectURL(blob), createdAt: r.createdAt, tampered });
    }
  }
  return out;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

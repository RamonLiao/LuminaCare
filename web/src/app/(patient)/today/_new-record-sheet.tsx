"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Adaptation: `useSolanaWallets` does NOT exist in @privy-io/react-auth.
// The correct hook is `useWallets` (exported as `useWallets`) from @privy-io/react-auth/solana.
// It returns { wallets: ConnectedStandardSolanaWallet[], ready: boolean }.
import { useWallets } from "@privy-io/react-auth/solana";
import { v4 as uuidv4 } from "uuid";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { generateAesKey, randomIv, encrypt, exportKey } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import { uploadCipher } from "@/lib/blob/upload";
import { getProgram, recordPda } from "@/lib/anchor/client";
import { adaptPrivyWallet } from "@/lib/anchor/wallet-adapter";
import { assertSufficientBalance } from "@/lib/solana/balance";
import { addRecord, nextVersion } from "@/lib/storage/records";
import type { ConnectedStandardSolanaWallet } from "@privy-io/js-sdk-core";

export function NewRecordSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  // Adaptation: correct hook name is `useWallets` (not `useSolanaWallets`)
  const { wallets } = useWallets();
  const privyWallet = wallets[0] as ConnectedStandardSolanaWallet | undefined;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!privyWallet) {
      setMsg("Wallet not ready");
      return;
    }
    if (!text && !file) {
      setMsg("Enter text or choose a file");
      return;
    }
    setBusy(true);
    setMsg("Checking balance…");
    try {
      await assertSufficientBalance(privyWallet.address);
      setMsg("Encrypting…");
      const raw = file
        ? new Uint8Array(await file.arrayBuffer())
        : new TextEncoder().encode(text);
      const key = await generateAesKey();
      const iv = randomIv();
      const cipher = await encrypt(raw, key, iv);

      setMsg("Uploading backup…");
      const blobUrl = await uploadCipher(cipher, `${uuidv4()}.bin`);

      setMsg("Computing fingerprint…");
      const hash = await sha256(cipher);

      setMsg("Writing attestation on-chain…");
      // Adaptation: wrap ConnectedStandardSolanaWallet → PrivySolWallet before passing to getProgram
      const wallet = adaptPrivyWallet(privyWallet);
      const program = getProgram(wallet);
      const patient = new PublicKey(wallet.address);
      const version = await nextVersion();
      const [pda] = recordPda(patient, version);

      const sig = await program.methods
        .anchorRecord(Array.from(hash), version)
        .accounts({ record: pda, patient, systemProgram: SystemProgram.programId })
        .rpc();

      await addRecord({
        recordId: uuidv4(),
        pdaAddress: pda.toBase58(),
        blobUrl,
        aesKey: await exportKey(key),
        iv: iv.buffer as ArrayBuffer,
        contentHash: hash.buffer as ArrayBuffer,
        version,
        kind: file
          ? file.type.startsWith("audio")
            ? "audio"
            : "photo"
          : "text",
        preview: file ? `📎 ${file.name}` : text.slice(0, 40),
        createdAt: Date.now(),
        txSig: sig,
      });

      setMsg("Done!");
      setText("");
      setFile(null);
      setTimeout(() => {
        onOpenChange(false);
        setMsg(null);
      }, 800);
    } catch (e) {
      console.error(e);
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="text">Description</Label>
            <Input
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did you see the doctor for, how do you feel…"
            />
          </div>
          <div>
            <Label htmlFor="file">Or upload a photo / voice note</Label>
            <Input
              id="file"
              type="file"
              accept="image/*,audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {msg && <p className="text-sm text-slate-500">{msg}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

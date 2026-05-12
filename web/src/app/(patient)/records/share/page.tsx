"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import QRCode from "qrcode";
import { BN } from "@coral-xyz/anchor";
import { v4 as uuidv4 } from "uuid";
import type { ConnectedStandardSolanaWallet } from "@privy-io/js-sdk-core";
import { listRecords } from "@/lib/storage/records";
import { addGrant } from "@/lib/storage/grants";
import { generateAesKey, randomIv, encrypt, exportKey, toBase64 } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import { uploadCipher } from "@/lib/blob/upload";
import { getProgram, grantPda, PROGRAM_ID } from "@/lib/anchor/client";
import { adaptPrivyWallet } from "@/lib/anchor/wallet-adapter";
import { assertSufficientBalance } from "@/lib/solana/balance";
import { encodePayload } from "@/lib/qr/payload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function SharePageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const preselect = sp.get("ids")?.split(",") ?? [];
  const { wallets } = useWallets();
  const privyWallet = wallets[0] as ConnectedStandardSolanaWallet | undefined;

  const [records, setRecords] = useState<Awaited<ReturnType<typeof listRecords>>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(preselect));
  const [granteeLabel, setGranteeLabel] = useState("");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { listRecords().then(setRecords); }, []);
  const expiresAt = useMemo(() => Math.floor(Date.now() / 1000) + hours * 3600, [hours]);

  async function generate() {
    if (!privyWallet) { setMsg("Wallet not ready"); return; }
    if (picked.size === 0) { setMsg("Select at least one record"); return; }
    if (!granteeLabel) { setMsg("Doctor label required"); return; }
    setBusy(true); setMsg("Checking balance…");
    try {
      await assertSufficientBalance(privyWallet.address);
      setMsg("Packaging…");
      const selected = records.filter((r) => picked.has(r.recordId));
      const bundleObj = {
        records: selected.map((r) => ({
          recordId: r.recordId,
          pdaAddress: r.pdaAddress,
          blobUrl: r.blobUrl,
          aesKey: toBase64(r.aesKey),
          iv: toBase64(r.iv),
          kind: r.kind,
          createdAt: r.createdAt,
        })),
      };
      const bundleJson = new TextEncoder().encode(JSON.stringify(bundleObj));
      const bundleKey = await generateAesKey();
      const bundleIv = randomIv();
      const bundleCipher = await encrypt(bundleJson, bundleKey, bundleIv);

      setMsg("Uploading grant bundle…");
      const bundleUrl = await uploadCipher(bundleCipher, `grant-${uuidv4()}.bin`);

      const grantIdBytes = crypto.getRandomValues(new Uint8Array(16));
      const grantIdHex = Array.from(grantIdBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      setMsg("Computing grant fingerprint…");
      const labelHash = await sha256(new TextEncoder().encode(`${granteeLabel}:${grantIdHex}`));

      setMsg("Writing grant on-chain…");
      const wallet = adaptPrivyWallet(privyWallet);
      const program = getProgram(wallet);
      const patient = new PublicKey(wallet.address);
      const [pda] = grantPda(patient, grantIdBytes);

      await program.methods
        .issueGrant(
          Array.from(grantIdBytes),
          selected.map((r) => new PublicKey(r.pdaAddress)),
          Array.from(labelHash),
          new BN(expiresAt),
        )
        .accounts({ grant: pda, patient, systemProgram: SystemProgram.programId })
        .rpc();

      const exportedKey = await exportKey(bundleKey);
      const payload = encodePayload({
        v: 1,
        grantId: grantIdHex,
        patientPubkey: patient.toBase58(),
        bundleUrl,
        bundleKey: toBase64(exportedKey),
        bundleIv: toBase64(bundleIv),
        programId: PROGRAM_ID.toBase58(),
        cluster: "devnet",
      });
      const qrDataUrl = await QRCode.toDataURL(
        `${window.location.origin}/viewer?p=${encodeURIComponent(payload)}`,
        { width: 320, margin: 1 },
      );
      setQr(qrDataUrl);

      await addGrant({
        grantId: grantIdHex,
        pdaAddress: pda.toBase58(),
        recordIds: selected.map((r) => r.recordId),
        granteeLabel,
        expiresAt,
        revoked: false,
        bundleUrl,
        bundleKey: exportedKey,
        bundleIv: bundleIv.buffer as ArrayBuffer,
        qrPayload: payload,
        createdAt: Date.now(),
      });
      setMsg(null);
    } catch (e) {
      console.error(e);
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (qr) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <h1 className="text-xl font-bold">Show this to the doctor</h1>
        <img src={qr} alt="QR" className="rounded border" />
        <p className="text-xs text-slate-500">Expires in {hours} hour(s). To stop sooner, revoke from the Records page.</p>
        <Button onClick={() => router.push("/records")}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Share with doctor</h1>
      <div>
        <Label htmlFor="who">Doctor / clinic label</Label>
        <Input id="who" value={granteeLabel} onChange={(e) => setGranteeLabel(e.target.value)} placeholder="Dr Smith / St Mary's Cardiology" />
      </div>
      <div>
        <Label htmlFor="hours">Valid for (hours)</Label>
        <Input id="hours" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </div>
      <p className="text-sm text-slate-500">Select records to share:</p>
      <ul className="space-y-2">
        {records.map((r) => (
          <li key={r.recordId}>
            <Card className="flex items-center gap-3 p-3">
              <Checkbox
                checked={picked.has(r.recordId)}
                onCheckedChange={(c) => {
                  const next = new Set(picked);
                  if (c) next.add(r.recordId); else next.delete(r.recordId);
                  setPicked(next);
                }}
              />
              <div className="flex-1">
                <p className="text-sm">{r.preview}</p>
                <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()} · v{r.version}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {msg && <p className="text-sm text-rose-600">{msg}</p>}
      <Button className="w-full" onClick={generate} disabled={busy}>Generate QR</Button>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-4">Loading…</div>}>
      <SharePageInner />
    </Suspense>
  );
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { decodePayload, type QrPayloadV1 } from "@/lib/qr/payload";
import { decryptGrant, type DecryptedRecord } from "../_decrypt";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Inner() {
  const sp = useSearchParams();
  const [state, setState] = useState<
    | { kind: "loading"; msg: string }
    | { kind: "error"; msg: string }
    | { kind: "ok"; records: DecryptedRecord[]; payload: QrPayloadV1 }
  >({ kind: "loading", msg: "Verifying grant…" });

  useEffect(() => {
    (async () => {
      try {
        const raw = sp.get("p");
        if (!raw) throw new Error("Missing QR payload");
        const payload = decodePayload(raw);
        setState({ kind: "loading", msg: "Decrypting records…" });
        const records = await decryptGrant(payload, (m) => setState({ kind: "loading", msg: m }));
        setState({ kind: "ok", records, payload });
      } catch (e) {
        setState({ kind: "error", msg: (e as Error).message });
      }
    })();
  }, [sp]);

  if (state.kind === "loading") return <p className="p-6 text-center text-slate-500">{state.msg}</p>;
  if (state.kind === "error") return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="max-w-sm space-y-2 border-rose-300 bg-rose-50 p-6 text-rose-700">
        <h1 className="font-bold">Unable to display</h1>
        <p className="text-sm">{state.msg}</p>
      </Card>
    </main>
  );

  return (
    <main className="space-y-4 p-4">
      <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">✓ Verified on-chain</div>
      {state.records.map((r, i) => (
        <Card key={i} className="space-y-2 p-4">
          <div className="flex justify-between">
            <Badge>{r.kind}</Badge>
            {r.tampered && <Badge variant="destructive">Fingerprint mismatch</Badge>}
          </div>
          {r.kind === "text" && <p className="whitespace-pre-wrap">{r.text}</p>}
          {r.kind === "photo" && r.url && <img src={r.url} alt="" className="w-full rounded" />}
          {r.kind === "audio" && r.url && <audio src={r.url} controls className="w-full" />}
          <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</p>
        </Card>
      ))}
    </main>
  );
}

export default function ViewerRenderPage() {
  return <Suspense><Inner /></Suspense>;
}

"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRecord } from "@/lib/storage/records";
import { decrypt, importKey } from "@/lib/crypto/aes";

export default function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [content, setContent] = useState<string>("");
  const [kind, setKind] = useState<string>("text");
  const [meta, setMeta] = useState<{ txSig: string; version: number } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getRecord(id);
      if (!r) return;
      setKind(r.kind);
      setMeta({ txSig: r.txSig, version: r.version });
      const key = await importKey(r.aesKey);
      const cipher = await fetch(r.blobUrl).then((res) => res.arrayBuffer());
      const plain = await decrypt(cipher, key, new Uint8Array(r.iv));
      if (r.kind === "text") {
        setContent(new TextDecoder().decode(plain));
      } else {
        const blob = new Blob([plain], { type: r.kind === "photo" ? "image/*" : "audio/*" });
        setContent(URL.createObjectURL(blob));
      }
    })();
  }, [id]);

  return (
    <div className="space-y-4 p-4">
      <Link href="/records" className="text-sm text-slate-500">← Back</Link>
      <Card className="p-4">
        {kind === "text" && <p className="whitespace-pre-wrap">{content}</p>}
        {kind === "photo" && content && <img src={content} alt="" className="w-full rounded" />}
        {kind === "audio" && content && <audio src={content} controls className="w-full" />}
      </Card>
      {meta && (
        <p className="text-xs text-slate-400">
          Attested v{meta.version} · tx{" "}
          <a className="underline" href={`https://solscan.io/tx/${meta.txSig}?cluster=devnet`} target="_blank" rel="noreferrer">
            {meta.txSig.slice(0, 8)}…
          </a>
        </p>
      )}
      <Button className="w-full" onClick={() => { window.location.href = `/records/share?ids=${id}`; }}>Share this with a doctor</Button>
    </div>
  );
}

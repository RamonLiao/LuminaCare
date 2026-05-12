"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter, useSearchParams } from "next/navigation";

function ScannerInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const direct = sp.get("p");
    if (direct) { go(direct); return; }
    if (!ref.current) return;
    const id = "qr-region";
    ref.current.id = id;
    const scanner = new Html5Qrcode(id);
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
      (text) => { scanner.stop().catch(() => {}); handle(text); },
      () => {})
      .catch((e) => setErr((e as Error).message));
    return () => { scanner.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(text: string) {
    try {
      const url = new URL(text);
      const p = url.searchParams.get("p");
      if (p) { go(p); return; }
    } catch { /* fall through */ }
    go(text);
  }
  function go(payload: string) {
    router.replace(`/viewer/render?p=${encodeURIComponent(payload)}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 p-4">
      <h1 className="text-xl font-bold">Scan patient QR</h1>
      <div ref={ref} className="w-full max-w-sm" />
      {err && <p className="text-rose-600">{err}</p>}
    </main>
  );
}

export default function ViewerScanPage() {
  return <Suspense><ScannerInner /></Suspense>;
}

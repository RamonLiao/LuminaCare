"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (ready && authenticated) router.replace("/today");
  }, [ready, authenticated, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">LuminaCare</h1>
        <p className="mt-2 text-slate-600">Medical-grade attestation. Scan once to view.</p>
      </div>
      <Button size="lg" onClick={login} disabled={!ready}>Sign in / Sign up</Button>
      <p className="text-xs text-slate-400">By signing in you accept the Terms of Service and Privacy Policy</p>
    </main>
  );
}

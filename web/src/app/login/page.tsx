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
        <h1 className="text-3xl font-bold">病歷隨身</h1>
        <p className="mt-2 text-slate-600">醫療級存證．一掃即看</p>
      </div>
      <Button size="lg" onClick={login} disabled={!ready}>登入 / 註冊</Button>
      <p className="text-xs text-slate-400">登入即同意服務條款與隱私權政策</p>
    </main>
  );
}

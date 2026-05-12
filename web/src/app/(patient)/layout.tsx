"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TabBar } from "@/lib/ui/tab-bar";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return <div className="flex min-h-dvh items-center justify-center text-slate-400">載入中…</div>;
  }
  return (
    <div className="flex min-h-dvh flex-col pb-16">
      <main className="flex-1">{children}</main>
      <TabBar />
    </div>
  );
}

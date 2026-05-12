"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function MePage() {
  const { user, logout } = usePrivy();
  const { wallets } = useWallets();
  const w = wallets[0];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">我</h1>
      <Card className="space-y-2 p-4">
        <p className="text-sm">{user?.email?.address ?? user?.google?.email ?? "未知帳號"}</p>
        <p className="text-xs text-slate-400 break-all">
          存證地址 <span data-testid="full-address">{w?.address ?? "—"}</span>
        </p>
        {w && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(w.address);
              alert("已複製");
            }}
          >
            複製地址
          </Button>
        )}
      </Card>
      <Button variant="outline" className="w-full" onClick={() => alert("PDF 匯出即將推出")}>
        匯出 PDF
      </Button>
      <Button variant="destructive" className="w-full" onClick={logout}>登出</Button>
    </div>
  );
}

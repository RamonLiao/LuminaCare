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
      <h1 className="text-2xl font-bold">Me</h1>
      <Card className="space-y-2 p-4">
        <p className="text-sm">{user?.email?.address ?? user?.google?.email ?? "Unknown account"}</p>
        <p className="text-xs text-slate-400 break-all">
          Attestation address <span data-testid="full-address">{w?.address ?? "—"}</span>
        </p>
        {w && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(w.address);
              alert("Copied");
            }}
          >
            Copy address
          </Button>
        )}
      </Card>
      <Button variant="outline" className="w-full" onClick={() => alert("PDF export coming soon")}>
        Export PDF
      </Button>
      <Button variant="destructive" className="w-full" onClick={logout}>Sign out</Button>
    </div>
  );
}

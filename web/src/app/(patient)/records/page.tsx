"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { listRecords } from "@/lib/storage/records";
import { listGrants, markRevoked } from "@/lib/storage/grants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useWallets } from "@privy-io/react-auth/solana";
import { getProgram } from "@/lib/anchor/client";
import { adaptPrivyWallet } from "@/lib/anchor/wallet-adapter";
import { assertSufficientBalance } from "@/lib/solana/balance";
import { PublicKey } from "@solana/web3.js";
import type { ConnectedStandardSolanaWallet } from "@privy-io/js-sdk-core";

function RevokeButton({ grantId, pda }: { grantId: string; pda: string }) {
  const { wallets } = useWallets();
  const privyWallet = wallets[0] as ConnectedStandardSolanaWallet | undefined;
  const [busy, setBusy] = useState(false);
  async function revoke() {
    if (!privyWallet) return;
    if (!confirm("確定撤銷？醫師將立即無法查看。")) return;
    setBusy(true);
    try {
      await assertSufficientBalance(privyWallet.address);
      const wallet = adaptPrivyWallet(privyWallet);
      const program = getProgram(wallet);
      await program.methods.revokeGrant()
        .accounts({ grant: new PublicKey(pda), patient: new PublicKey(wallet.address) })
        .rpc();
      await markRevoked(grantId);
    } catch (e) { alert(`失敗：${(e as Error).message}`); }
    finally { setBusy(false); }
  }
  return <Button variant="destructive" size="sm" onClick={revoke} disabled={busy}>撤銷</Button>;
}

export default function RecordsPage() {
  const records = useLiveQuery(() => listRecords(), [], []);
  const grants = useLiveQuery(() => listGrants(), [], []);
  const activeGrants = (grants ?? []).filter((g) => !g.revoked && g.expiresAt > Date.now() / 1000);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">病歷</h1>
        <Link href="/records/share"><Button>分享給醫師</Button></Link>
      </div>

      {activeGrants.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-500">授權中</h2>
          {activeGrants.map((g) => (
            <Card key={g.grantId} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm">{g.granteeLabel}</p>
                <p className="text-xs text-slate-400">
                  {g.recordIds.length} 筆 · 到期 {new Date(g.expiresAt * 1000).toLocaleString()}
                </p>
              </div>
              <RevokeButton grantId={g.grantId} pda={g.pdaAddress} />
            </Card>
          ))}
        </section>
      )}

      <ul className="space-y-2">
        {(records ?? []).map((r) => (
          <li key={r.recordId}>
            <Link href={`/records/${r.recordId}`}>
              <Card className="p-4">
                <div className="flex justify-between">
                  <Badge variant="secondary">{r.kind}</Badge>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm">{r.preview}</p>
              </Card>
            </Link>
          </li>
        ))}
        {records?.length === 0 && <p className="text-center text-sm text-slate-400">還沒有紀錄</p>}
      </ul>
    </div>
  );
}

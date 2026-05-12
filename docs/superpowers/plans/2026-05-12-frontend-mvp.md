# Portable Health Frontend MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Next.js PWA (病人 3 Tab) + 醫師 viewer，整合既有 `portable_health` Anchor program (devnet)，可在手機瀏覽器跑通新增病歷 → QR 授權 → 醫師掃描解密 → 撤銷的完整 demo。

**Architecture:** Next.js 16 App Router 單 repo，`(patient)` route group wrap `<PrivyProvider>`，`viewer` 平行 route 無 auth。病歷 AES-GCM 加密後上 Vercel Blob，鏈上只存 SHA-256 hash + 授權 metadata。AES key 留在病人裝置 IndexedDB (Dexie)。

**Tech Stack:** Next.js 16, Tailwind 4, shadcn/ui, `@privy-io/react-auth`, `@solana/web3.js`, `@coral-xyz/anchor` (TS client), `@vercel/blob`, Dexie, Web Crypto API, `qrcode`, `html5-qrcode`.

**Spec:** `docs/superpowers/specs/2026-05-12-frontend-mvp-design.md`

**Working dir:** `web/`（新建，與既有 `chain/portable_health/` 平行）

---

## File Structure

```
web/
  package.json
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  tailwind.config.ts
  components.json                  ← shadcn config
  .env.local.example
  public/
    manifest.json
    sw.js
    icons/icon-192.png
    icons/icon-512.png
  src/
    app/
      layout.tsx                   ← <html> + global providers wrap point
      globals.css                  ← tailwind directives
      page.tsx                     ← redirect to /today (if logged in) or /login
      login/page.tsx               ← Privy login UI
      register-sw.tsx              ← client component for sw registration
      (patient)/
        layout.tsx                 ← PrivyProvider + auth gate + bottom tab bar
        today/page.tsx
        records/page.tsx
        records/[id]/page.tsx
        records/share/page.tsx
        me/page.tsx
      viewer/
        page.tsx                   ← QR scanner
        render/page.tsx            ← decrypt + render
        _decrypt.ts
      api/
        blob/upload/route.ts       ← signed upload token
    lib/
      privy/config.ts
      solana/connection.ts
      anchor/idl.json              ← copy of target/idl/portable_health.json
      anchor/types.ts              ← generated TS types
      anchor/client.ts             ← Program factory bound to Privy signer
      crypto/aes.ts
      crypto/hash.ts
      blob/upload.ts
      storage/db.ts                ← Dexie schema
      storage/records.ts           ← record CRUD wrappers
      storage/grants.ts            ← grant CRUD wrappers
      qr/payload.ts                ← QR JSON encode/decode
      ui/tab-bar.tsx               ← bottom tab bar component
    components/                    ← shadcn-installed components
```

---

## Task 0: 環境前置（手動，由人執行）

**目的：** 註冊外部服務、拿 token，後面 task 才能跑。

- [ ] **Step 0.1：** 註冊 Privy（https://dashboard.privy.io）→ 建 app → 拿 `App ID`
- [ ] **Step 0.2：** Privy dashboard → Login methods 開啟 Google + Email
- [ ] **Step 0.3：** Privy dashboard → Chains 加 Solana Devnet
- [ ] **Step 0.4：** 註冊 Helius（https://helius.dev）free tier → 拿 devnet RPC URL
- [ ] **Step 0.5：** 註冊 Vercel + 建 project（先空專案，連 GitHub repo）→ Storage → 建 Blob store → 拿 `BLOB_READ_WRITE_TOKEN`
- [ ] **Step 0.6：** 確認 `target/idl/portable_health.json` 存在（在 `chain/portable_health/`）

**Checkpoint：** 手上有 4 個 secret：Privy App ID、Helius URL、Vercel Blob token、IDL 路徑。

---

## Task 1: 建專案骨架

**Files:**
- Create: `web/`

- [ ] **Step 1.1：** 在 repo root 跑：

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Solona_Frontier_Online_Hackathon
npx create-next-app@latest web \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" --no-eslint --turbopack --use-npm
```

- [ ] **Step 1.2：** 進 web 安裝核心依賴：

```bash
cd web
npm install \
  @privy-io/react-auth \
  @solana/web3.js \
  @coral-xyz/anchor \
  @vercel/blob \
  dexie dexie-react-hooks \
  qrcode html5-qrcode \
  uuid bs58 bn.js
npm install -D @types/qrcode @types/uuid @types/bn.js
```

- [ ] **Step 1.3：** 初始化 shadcn：

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label dialog toast badge checkbox
```

- [ ] **Step 1.4：** 建 `.env.local.example`：

```
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_RPC_PRIMARY=https://devnet.helius-rpc.com/?api-key=
NEXT_PUBLIC_RPC_FALLBACK=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=EtT9N7bf5YgEqHDBDkSTSGusZFEbKWiPdNNTkg2Nx8dA
BLOB_READ_WRITE_TOKEN=
```

複製成 `.env.local` 並填入 Task 0 的 secrets。

- [ ] **Step 1.5：** `npm run dev` 確認 http://localhost:3000 起得來。Ctrl+C 停掉。

- [ ] **Step 1.6：** Commit：

```bash
cd ..
git add web/ .gitignore
git commit -m "feat(web): bootstrap next.js + tailwind + shadcn"
```

---

## Task 2: 複製 IDL + Anchor TS types

**Files:**
- Create: `web/src/lib/anchor/idl.json`
- Create: `web/src/lib/anchor/types.ts`

- [ ] **Step 2.1：**

```bash
cp chain/portable_health/target/idl/portable_health.json web/src/lib/anchor/idl.json
```

- [ ] **Step 2.2：** `web/src/lib/anchor/types.ts`：

```ts
import type { Idl } from "@coral-xyz/anchor";
import idlJson from "./idl.json";

export const IDL = idlJson as Idl;

export type HealthRecord = {
  patient: string;
  contentHash: number[];
  createdAt: number;
  version: number;
};

export type AccessGrant = {
  patient: string;
  recordIds: string[];
  granteeLabelHash: number[];
  expiresAt: number;
  revoked: boolean;
};
```

- [ ] **Step 2.3：** Commit：

```bash
git add web/src/lib/anchor/
git commit -m "feat(web): import portable_health IDL + types"
```

---

## Task 3: Solana Connection + Privy config

**Files:**
- Create: `web/src/lib/solana/connection.ts`
- Create: `web/src/lib/privy/config.ts`

- [ ] **Step 3.1：** `connection.ts`：

```ts
import { Connection, clusterApiUrl } from "@solana/web3.js";

let cached: Connection | null = null;

export function getConnection(): Connection {
  if (cached) return cached;
  const primary = process.env.NEXT_PUBLIC_RPC_PRIMARY;
  const fallback = process.env.NEXT_PUBLIC_RPC_FALLBACK ?? clusterApiUrl("devnet");
  cached = new Connection(primary || fallback, { commitment: "confirmed" });
  return cached;
}
```

- [ ] **Step 3.2：** `config.ts`：

```ts
import type { PrivyClientConfig } from "@privy-io/react-auth";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "light",
    accentColor: "#0ea5e9",
  },
  embeddedWallets: {
    solana: { createOnLogin: "users-without-wallets" },
  },
};
```

- [ ] **Step 3.3：** Commit：

```bash
git add web/src/lib/
git commit -m "feat(web): solana connection + privy config"
```

---

## Task 4: Crypto helpers

**Files:**
- Create: `web/src/lib/crypto/aes.ts`
- Create: `web/src/lib/crypto/hash.ts`

- [ ] **Step 4.1：** `aes.ts`：

```ts
const ALG = "AES-GCM";
const IV_LEN = 12;

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALG, length: 256 }, true, ["encrypt", "decrypt"]);
}

export function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LEN));
}

export async function encrypt(data: ArrayBuffer | Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: ALG, iv }, key, data);
}

export async function decrypt(ciphertext: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: ALG, iv }, key, ciphertext);
}

export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key);
}

export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, ALG, true, ["encrypt", "decrypt"]);
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4.2：** `hash.ts`：

```ts
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}
```

- [ ] **Step 4.3：** Commit：

```bash
git add web/src/lib/crypto/
git commit -m "feat(web): web crypto AES-GCM + SHA-256 helpers"
```

---

## Task 5: IndexedDB (Dexie) schema

**Files:**
- Create: `web/src/lib/storage/db.ts`
- Create: `web/src/lib/storage/records.ts`
- Create: `web/src/lib/storage/grants.ts`

- [ ] **Step 5.1：** `db.ts`：

```ts
import Dexie, { type Table } from "dexie";

export type RecordRow = {
  recordId: string;
  pdaAddress: string;
  blobUrl: string;
  aesKey: ArrayBuffer;
  iv: ArrayBuffer;
  contentHash: ArrayBuffer;
  version: number;
  kind: "photo" | "audio" | "text";
  preview: string;
  createdAt: number;
  txSig: string;
};

export type GrantRow = {
  grantId: string;
  pdaAddress: string;
  recordIds: string[];
  granteeLabel: string;
  expiresAt: number;
  revoked: boolean;
  bundleUrl: string;
  bundleKey: ArrayBuffer;
  bundleIv: ArrayBuffer;
  qrPayload: string;
  createdAt: number;
};

class PHDb extends Dexie {
  records!: Table<RecordRow, string>;
  grants!: Table<GrantRow, string>;
  constructor() {
    super("portable_health");
    this.version(1).stores({
      records: "recordId, version, createdAt",
      grants: "grantId, expiresAt, revoked, createdAt",
    });
  }
}

export const db = new PHDb();
```

- [ ] **Step 5.2：** `records.ts`：

```ts
import { db, type RecordRow } from "./db";

export async function addRecord(row: RecordRow): Promise<void> {
  await db.records.add(row);
}
export async function listRecords(): Promise<RecordRow[]> {
  return db.records.orderBy("createdAt").reverse().toArray();
}
export async function getRecord(recordId: string): Promise<RecordRow | undefined> {
  return db.records.get(recordId);
}
export async function nextVersion(): Promise<number> {
  const last = await db.records.orderBy("version").last();
  return (last?.version ?? 0) + 1;
}
```

- [ ] **Step 5.3：** `grants.ts`：

```ts
import { db, type GrantRow } from "./db";

export async function addGrant(row: GrantRow): Promise<void> {
  await db.grants.add(row);
}
export async function listGrants(): Promise<GrantRow[]> {
  return db.grants.orderBy("createdAt").reverse().toArray();
}
export async function markRevoked(grantId: string): Promise<void> {
  await db.grants.update(grantId, { revoked: true });
}
```

- [ ] **Step 5.4：** Commit：

```bash
git add web/src/lib/storage/
git commit -m "feat(web): dexie schema + CRUD wrappers"
```

---

## Task 6: Vercel Blob upload

**Files:**
- Create: `web/src/app/api/blob/upload/route.ts`
- Create: `web/src/lib/blob/upload.ts`

- [ ] **Step 6.1：** `route.ts`：

```ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/octet-stream"],
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6.2：** `upload.ts`：

```ts
import { upload } from "@vercel/blob/client";

export async function uploadCipher(ciphertext: ArrayBuffer, filename: string): Promise<string> {
  const blob = new Blob([ciphertext], { type: "application/octet-stream" });
  const result = await upload(filename, blob, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
  });
  return result.url;
}
```

- [ ] **Step 6.3：** Commit：

```bash
git add web/src/app/api/ web/src/lib/blob/
git commit -m "feat(web): vercel blob signed upload"
```

---

## Task 7: Anchor TS client (Privy signer adapter)

**Files:**
- Create: `web/src/lib/anchor/client.ts`

- [ ] **Step 7.1：**

```ts
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { IDL } from "./types";
import { getConnection } from "@/lib/solana/connection";

export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);

export type PrivySolWallet = {
  address: string;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

function adaptWallet(w: PrivySolWallet): Wallet {
  return {
    publicKey: new PublicKey(w.address),
    signTransaction: w.signTransaction,
    signAllTransactions: w.signAllTransactions,
    payer: undefined as never,
  };
}

export function getProgram(wallet: PrivySolWallet) {
  const provider = new AnchorProvider(getConnection(), adaptWallet(wallet), {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

export function recordPda(patient: PublicKey, version: number): [PublicKey, number] {
  const versionLE = Buffer.alloc(4);
  versionLE.writeUInt32LE(version, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("record"), patient.toBuffer(), versionLE],
    PROGRAM_ID,
  );
}

export function grantPda(patient: PublicKey, grantId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("grant"), patient.toBuffer(), Buffer.from(grantId)],
    PROGRAM_ID,
  );
}
```

- [ ] **Step 7.2：** 比對 PDA seed 與合約一致：

```bash
grep -n "seeds" chain/portable_health/programs/portable_health/src/instructions/*.rs
```

若不符合馬上改 `client.ts`。

- [ ] **Step 7.3：** Commit：

```bash
git add web/src/lib/anchor/
git commit -m "feat(web): anchor program client + PDA helpers"
```

---

## Task 8: QR payload codec

**Files:**
- Create: `web/src/lib/qr/payload.ts`

- [ ] **Step 8.1：**

```ts
import { fromBase64, toBase64 } from "@/lib/crypto/aes";

export type QrPayloadV1 = {
  v: 1;
  grantId: string;
  patientPubkey: string;
  bundleUrl: string;
  bundleKey: string;
  bundleIv: string;
  programId: string;
  cluster: "devnet";
};

export function encodePayload(p: QrPayloadV1): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(p)));
}

export function decodePayload(s: string): QrPayloadV1 {
  const json = new TextDecoder().decode(fromBase64(s));
  const obj = JSON.parse(json);
  if (obj.v !== 1) throw new Error("unsupported QR version");
  return obj;
}
```

- [ ] **Step 8.2：** Commit：

```bash
git add web/src/lib/qr/
git commit -m "feat(web): QR payload v1 codec"
```

---

## Task 9: Root layout + Privy provider + login + patient layout

**Files:**
- Modify: `web/src/app/layout.tsx`
- Create: `web/src/app/providers.tsx`
- Create: `web/src/app/page.tsx`
- Create: `web/src/app/login/page.tsx`
- Create: `web/src/app/(patient)/layout.tsx`

- [ ] **Step 9.1：** `providers.tsx`：

```tsx
"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { PRIVY_APP_ID, privyConfig } from "@/lib/privy/config";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      {children}
    </PrivyProvider>
  );
}
```

- [ ] **Step 9.2：** `layout.tsx`：

```tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "病歷隨身",
  description: "醫療級存證．分享一掃即看",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 9.3：** `page.tsx`：

```tsx
"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(authenticated ? "/today" : "/login");
  }, [ready, authenticated, router]);
  return null;
}
```

- [ ] **Step 9.4：** `login/page.tsx`：

```tsx
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
```

- [ ] **Step 9.5：** `(patient)/layout.tsx`：

```tsx
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
```

- [ ] **Step 9.6：** Commit：

```bash
git add web/src/app/
git commit -m "feat(web): root layout + privy provider + login + patient layout"
```

---

## Task 10: Bottom Tab Bar

**Files:**
- Create: `web/src/lib/ui/tab-bar.tsx`

- [ ] **Step 10.1：**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, User } from "lucide-react";

const tabs = [
  { href: "/today", label: "今日", icon: Home },
  { href: "/records", label: "病歷", icon: FileText },
  { href: "/me", label: "我", icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t bg-white">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs ${active ? "text-sky-600" : "text-slate-500"}`}>
            <Icon size={22} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 10.2：** 確認 `lucide-react` 安裝（shadcn 通常會帶；沒有就 `npm install lucide-react`）。

- [ ] **Step 10.3：** `npm run dev` 驗證底部 3 tab 切換正常（內頁尚未實作會 404）。

- [ ] **Step 10.4：** Commit：

```bash
git add web/src/lib/ui/
git commit -m "feat(web): bottom tab bar"
```

---

## Task 11: Tab 今日 + Flow A（新增病歷）

**Files:**
- Create: `web/src/app/(patient)/today/page.tsx`
- Create: `web/src/app/(patient)/today/_new-record-sheet.tsx`

- [ ] **Step 11.1：** `today/page.tsx`：

```tsx
"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pill, Calendar } from "lucide-react";
import { NewRecordSheet } from "./_new-record-sheet";

const MOCK_REMINDERS = [
  { id: 1, kind: "藥", text: "早餐後 — 高血壓藥 1 顆", time: "08:00" },
  { id: 2, kind: "回診", text: "下週三 內科陳醫師", time: "週三 14:30" },
];

export default function TodayPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">今日</h1>
      <Button size="lg" className="h-16 w-full text-lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2" /> 新增今日紀錄
      </Button>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-500">提醒</h2>
        {MOCK_REMINDERS.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 p-4">
            {r.kind === "藥" ? <Pill /> : <Calendar />}
            <div className="flex-1">
              <p className="text-sm">{r.text}</p>
              <p className="text-xs text-slate-400">{r.time}</p>
            </div>
          </Card>
        ))}
      </section>
      <NewRecordSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
```

- [ ] **Step 11.2：** `_new-record-sheet.tsx` (Flow A)：

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { v4 as uuidv4 } from "uuid";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { generateAesKey, randomIv, encrypt, exportKey } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import { uploadCipher } from "@/lib/blob/upload";
import { getProgram, recordPda } from "@/lib/anchor/client";
import { addRecord, nextVersion } from "@/lib/storage/records";

export function NewRecordSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!wallet) { setMsg("錢包尚未準備"); return; }
    if (!text && !file) { setMsg("請輸入內容或選擇檔案"); return; }
    setBusy(true); setMsg("加密中…");
    try {
      const raw = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(text);
      const key = await generateAesKey();
      const iv = randomIv();
      const cipher = await encrypt(raw, key, iv);

      setMsg("上傳備份…");
      const blobUrl = await uploadCipher(cipher, `${uuidv4()}.bin`);

      setMsg("計算指紋…");
      const hash = await sha256(cipher);

      setMsg("寫入存證…");
      const program = getProgram(wallet);
      const patient = new PublicKey(wallet.address);
      const version = await nextVersion();
      const [pda] = recordPda(patient, version);

      const sig = await program.methods
        .anchorRecord(Array.from(hash), version)
        .accounts({ record: pda, patient, systemProgram: SystemProgram.programId })
        .rpc();

      await addRecord({
        recordId: uuidv4(),
        pdaAddress: pda.toBase58(),
        blobUrl,
        aesKey: await exportKey(key),
        iv: iv.buffer,
        contentHash: hash.buffer,
        version,
        kind: file ? (file.type.startsWith("audio") ? "audio" : "photo") : "text",
        preview: file ? `📎 ${file.name}` : text.slice(0, 40),
        createdAt: Date.now(),
        txSig: sig,
      });

      setMsg("完成！");
      setText(""); setFile(null);
      setTimeout(() => { onOpenChange(false); setMsg(null); }, 800);
    } catch (e) {
      console.error(e);
      setMsg(`失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增紀錄</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="text">文字描述</Label>
            <Input id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="今天看了什麼診、感覺如何…" />
          </div>
          <div>
            <Label htmlFor="file">或上傳照片/錄音</Label>
            <Input id="file" type="file" accept="image/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {msg && <p className="text-sm text-slate-500">{msg}</p>}
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>儲存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 11.3：** 手動驗收：登入 → 新增 → 應看到「完成！」。到 https://solscan.io/?cluster=devnet 查 program 多一筆 tx。

- [ ] **Step 11.4：** Commit：

```bash
git add web/src/app/\(patient\)/today/
git commit -m "feat(web): tab today + flow A (new record)"
```

---

## Task 12: Tab 病歷 列表 + 詳情

**Files:**
- Create: `web/src/app/(patient)/records/page.tsx`
- Create: `web/src/app/(patient)/records/[id]/page.tsx`

- [ ] **Step 12.1：** `records/page.tsx`（含後續會用到的 RevokeButton 預留位）：

```tsx
"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { listRecords } from "@/lib/storage/records";
import { listGrants, markRevoked } from "@/lib/storage/grants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { getProgram } from "@/lib/anchor/client";
import { PublicKey } from "@solana/web3.js";

function RevokeButton({ grantId, pda }: { grantId: string; pda: string }) {
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];
  const [busy, setBusy] = useState(false);
  async function revoke() {
    if (!wallet) return;
    if (!confirm("確定撤銷？醫師將立即無法查看。")) return;
    setBusy(true);
    try {
      const program = getProgram(wallet);
      const grantIdBytes = new Uint8Array(grantId.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
      await program.methods.revokeGrant(Array.from(grantIdBytes))
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
```

- [ ] **Step 12.2：** `records/[id]/page.tsx`：

```tsx
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
      <Link href="/records" className="text-sm text-slate-500">← 返回</Link>
      <Card className="p-4">
        {kind === "text" && <p className="whitespace-pre-wrap">{content}</p>}
        {kind === "photo" && content && <img src={content} alt="" className="w-full rounded" />}
        {kind === "audio" && content && <audio src={content} controls className="w-full" />}
      </Card>
      {meta && (
        <p className="text-xs text-slate-400">
          存證版本 v{meta.version} · tx{" "}
          <a className="underline" href={`https://solscan.io/tx/${meta.txSig}?cluster=devnet`} target="_blank" rel="noreferrer">
            {meta.txSig.slice(0, 8)}…
          </a>
        </p>
      )}
      <Button asChild className="w-full"><Link href={`/records/share?ids=${id}`}>分享這筆給醫師</Link></Button>
    </div>
  );
}
```

- [ ] **Step 12.3：** 手動驗收：點清單 → 詳情頁 → 文字正確顯示 + tx 連結點得開。

- [ ] **Step 12.4：** Commit：

```bash
git add web/src/app/\(patient\)/records/
git commit -m "feat(web): tab records list + detail + revoke (flow D)"
```

---

## Task 13: Flow B — 分享授權產 QR

**Files:**
- Create: `web/src/app/(patient)/records/share/page.tsx`

- [ ] **Step 13.1：**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import QRCode from "qrcode";
import BN from "bn.js";
import { v4 as uuidv4 } from "uuid";
import { listRecords } from "@/lib/storage/records";
import { addGrant } from "@/lib/storage/grants";
import { generateAesKey, randomIv, encrypt, exportKey, toBase64 } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import { uploadCipher } from "@/lib/blob/upload";
import { getProgram, grantPda, PROGRAM_ID } from "@/lib/anchor/client";
import { encodePayload } from "@/lib/qr/payload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function SharePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const preselect = sp.get("ids")?.split(",") ?? [];
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

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
    if (!wallet) { setMsg("錢包尚未準備"); return; }
    if (picked.size === 0) { setMsg("請至少選一筆"); return; }
    if (!granteeLabel) { setMsg("請填醫師標籤"); return; }
    setBusy(true); setMsg("打包中…");
    try {
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

      setMsg("上傳授權包…");
      const bundleUrl = await uploadCipher(bundleCipher, `grant-${uuidv4()}.bin`);

      const grantIdBytes = crypto.getRandomValues(new Uint8Array(16));
      const grantIdHex = Array.from(grantIdBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      setMsg("計算授權指紋…");
      const labelHash = await sha256(new TextEncoder().encode(`${granteeLabel}:${grantIdHex}`));

      setMsg("寫入授權…");
      const program = getProgram(wallet);
      const patient = new PublicKey(wallet.address);
      const [pda] = grantPda(patient, grantIdBytes);

      await program.methods
        .issueGrant(
          Array.from(grantIdBytes),
          selected.map((r) => r.recordId),
          Array.from(labelHash),
          new BN(expiresAt),
        )
        .accounts({ grant: pda, patient, systemProgram: SystemProgram.programId })
        .rpc();

      const payload = encodePayload({
        v: 1,
        grantId: grantIdHex,
        patientPubkey: patient.toBase58(),
        bundleUrl,
        bundleKey: toBase64(await exportKey(bundleKey)),
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
        bundleKey: await exportKey(bundleKey),
        bundleIv: bundleIv.buffer,
        qrPayload: payload,
        createdAt: Date.now(),
      });
      setMsg(null);
    } catch (e) {
      console.error(e);
      setMsg(`失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (qr) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <h1 className="text-xl font-bold">請給醫師掃描</h1>
        <img src={qr} alt="QR" className="rounded border" />
        <p className="text-xs text-slate-500">{hours} 小時後自動失效。如需提前停止，到病歷頁撤銷。</p>
        <Button onClick={() => router.push("/records")}>完成</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">分享給醫師</h1>
      <div>
        <Label htmlFor="who">醫師 / 院所標籤</Label>
        <Input id="who" value={granteeLabel} onChange={(e) => setGranteeLabel(e.target.value)} placeholder="陳醫師 / 台大內科" />
      </div>
      <div>
        <Label htmlFor="hours">有效時數</Label>
        <Input id="hours" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </div>
      <p className="text-sm text-slate-500">選擇要分享的紀錄：</p>
      <ul className="space-y-2">
        {records.map((r) => (
          <li key={r.recordId}>
            <Card className="flex items-center gap-3 p-3">
              <Checkbox checked={picked.has(r.recordId)} onCheckedChange={(c) => {
                const next = new Set(picked);
                if (c) next.add(r.recordId); else next.delete(r.recordId);
                setPicked(next);
              }} />
              <div className="flex-1">
                <p className="text-sm">{r.preview}</p>
                <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()} · v{r.version}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {msg && <p className="text-sm text-rose-600">{msg}</p>}
      <Button className="w-full" onClick={generate} disabled={busy}>產生 QR</Button>
    </div>
  );
}
```

- [ ] **Step 13.2：** 手動驗收：選 1 筆 → 填醫師標籤 → 產 QR → 看到 QR 圖。Solscan 驗 issue_grant tx。

- [ ] **Step 13.3：** Commit：

```bash
git add web/src/app/\(patient\)/records/share/
git commit -m "feat(web): flow B - issue grant + QR generation"
```

---

## Task 14: Tab 我

**Files:**
- Create: `web/src/app/(patient)/me/page.tsx`

- [ ] **Step 14.1：**

```tsx
"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function MePage() {
  const { user, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const w = wallets[0];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">我</h1>
      <Card className="space-y-2 p-4">
        <p className="text-sm">{user?.email?.address ?? user?.google?.email ?? "未知帳號"}</p>
        <p className="text-xs text-slate-400">
          存證地址 {w ? `${w.address.slice(0, 8)}…${w.address.slice(-4)}` : "—"}
        </p>
      </Card>
      <Button variant="outline" className="w-full" onClick={() => alert("PDF 匯出即將推出")}>
        匯出 PDF
      </Button>
      <Button variant="destructive" className="w-full" onClick={logout}>登出</Button>
    </div>
  );
}
```

- [ ] **Step 14.2：** 手動驗收：Tab 我 → email + 地址正確 → 登出能跳回 /login。

- [ ] **Step 14.3：** Commit：

```bash
git add web/src/app/\(patient\)/me/
git commit -m "feat(web): tab me - profile + logout"
```

---

## Task 15: 醫師端 Viewer（Flow C）

**Files:**
- Create: `web/src/app/viewer/page.tsx`
- Create: `web/src/app/viewer/render/page.tsx`
- Create: `web/src/app/viewer/_decrypt.ts`

- [ ] **Step 15.1：** `viewer/page.tsx`：

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter, useSearchParams } from "next/navigation";

export default function ViewerScanPage() {
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
      .catch((e) => setErr(e.message));
    return () => { scanner.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(text: string) {
    try {
      const url = new URL(text);
      const p = url.searchParams.get("p");
      if (p) go(p); else throw new Error();
    } catch {
      go(text);
    }
  }
  function go(payload: string) {
    router.replace(`/viewer/render?p=${encodeURIComponent(payload)}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 p-4">
      <h1 className="text-xl font-bold">掃描病歷 QR</h1>
      <div ref={ref} className="w-full max-w-sm" />
      {err && <p className="text-rose-600">{err}</p>}
    </main>
  );
}
```

- [ ] **Step 15.2：** `_decrypt.ts`：

```ts
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import { getConnection } from "@/lib/solana/connection";
import { grantPda } from "@/lib/anchor/client";
import { IDL } from "@/lib/anchor/types";
import { decrypt, importKey, fromBase64 } from "@/lib/crypto/aes";
import { sha256 } from "@/lib/crypto/hash";
import type { QrPayloadV1 } from "@/lib/qr/payload";

export type DecryptedRecord = {
  kind: "text" | "photo" | "audio";
  text?: string;
  url?: string;
  createdAt: number;
  tampered: boolean;
};

function readonlyProgram() {
  const dummy: Wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
    payer: undefined as never,
  };
  const provider = new AnchorProvider(getConnection(), dummy, { commitment: "confirmed" });
  return new Program(IDL, provider);
}

export async function decryptGrant(p: QrPayloadV1, onProgress: (msg: string) => void): Promise<DecryptedRecord[]> {
  const patient = new PublicKey(p.patientPubkey);
  const grantIdBytes = new Uint8Array(p.grantId.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const [grantPdaAddr] = grantPda(patient, grantIdBytes);
  const program = readonlyProgram();

  onProgress("查詢授權狀態…");
  const grant = (await (program.account as any).accessGrant.fetch(grantPdaAddr)) as {
    revoked: boolean; expiresAt: { toNumber(): number };
  };
  if (grant.revoked) throw new Error("此授權已撤銷");
  if (grant.expiresAt.toNumber() * 1000 < Date.now()) throw new Error("此授權已到期");

  onProgress("下載授權包…");
  const bundleCipher = await fetch(p.bundleUrl).then((r) => r.arrayBuffer());
  const bundleKey = await importKey(fromBase64(p.bundleKey).buffer as ArrayBuffer);
  const bundlePlain = await decrypt(bundleCipher, bundleKey, fromBase64(p.bundleIv));
  const bundle = JSON.parse(new TextDecoder().decode(bundlePlain)) as {
    records: Array<{ blobUrl: string; aesKey: string; iv: string; kind: "text"|"photo"|"audio"; createdAt: number; pdaAddress: string }>;
  };

  const out: DecryptedRecord[] = [];
  for (const r of bundle.records) {
    onProgress(`解密第 ${out.length + 1} / ${bundle.records.length} 筆…`);
    const cipher = await fetch(r.blobUrl).then((res) => res.arrayBuffer());
    const calcHash = await sha256(cipher);

    const onChain = (await (program.account as any).healthRecord.fetch(new PublicKey(r.pdaAddress))) as { contentHash: number[] };
    const tampered = !arraysEqual(calcHash, Uint8Array.from(onChain.contentHash));

    const key = await importKey(fromBase64(r.aesKey).buffer as ArrayBuffer);
    const plain = await decrypt(cipher, key, fromBase64(r.iv));

    if (r.kind === "text") {
      out.push({ kind: "text", text: new TextDecoder().decode(plain), createdAt: r.createdAt, tampered });
    } else {
      const blob = new Blob([plain], { type: r.kind === "photo" ? "image/*" : "audio/*" });
      out.push({ kind: r.kind, url: URL.createObjectURL(blob), createdAt: r.createdAt, tampered });
    }
  }
  return out;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
```

- [ ] **Step 15.3：** `viewer/render/page.tsx`：

```tsx
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
  >({ kind: "loading", msg: "驗證授權…" });

  useEffect(() => {
    (async () => {
      try {
        const raw = sp.get("p");
        if (!raw) throw new Error("缺少 QR 內容");
        const payload = decodePayload(raw);
        setState({ kind: "loading", msg: "解密病歷…" });
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
        <h1 className="font-bold">無法顯示</h1>
        <p className="text-sm">{state.msg}</p>
      </Card>
    </main>
  );

  return (
    <main className="space-y-4 p-4">
      <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">✓ 已通過鏈上授權驗證</div>
      {state.records.map((r, i) => (
        <Card key={i} className="space-y-2 p-4">
          <div className="flex justify-between">
            <Badge>{r.kind}</Badge>
            {r.tampered && <Badge variant="destructive">指紋不符</Badge>}
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
```

- [ ] **Step 15.4：** 兩台裝置驗收：
  - 手機 A：登入 → 加紀錄 → 產 QR
  - 手機 B：開 `https://<vercel>.app/viewer` → 掃 QR → 應看到內容 + 綠勾
  - 手機 A 撤銷 → 手機 B 重掃 → 紅色「此授權已撤銷」

- [ ] **Step 15.5：** Commit：

```bash
git add web/src/app/viewer/
git commit -m "feat(web): viewer scanner + decrypt + on-chain validation"
```

---

## Task 16: PWA manifest + service worker

**Files:**
- Create: `web/public/manifest.json`
- Create: `web/public/sw.js`
- Create: `web/public/icons/icon-192.png`、`icon-512.png`
- Create: `web/src/app/register-sw.tsx`
- Modify: `web/src/app/layout.tsx`（引入 RegisterSW）

- [ ] **Step 16.1：** `manifest.json`：

```json
{
  "name": "病歷隨身",
  "short_name": "病歷",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 16.2：** `sw.js`：

```js
const CACHE = "ph-v1";
const SHELL = ["/", "/today", "/records", "/me", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 16.3：** `register-sw.tsx`（client component，避免 dangerouslySetInnerHTML）：

```tsx
"use client";
import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
```

- [ ] **Step 16.4：** 在 `layout.tsx` body 內 `<Providers>` 之後加：

```tsx
import { RegisterSW } from "./register-sw";
// ...
<body className="bg-slate-50 text-slate-900 antialiased">
  <Providers>{children}</Providers>
  <RegisterSW />
</body>
```

- [ ] **Step 16.5：** 圖示：先用任何 192x192 / 512x512 PNG 佔位（demo 前再換 logo）。

```bash
mkdir -p web/public/icons
# 用任一張方形 PNG 命名為 icon-192.png / icon-512.png 放進去
```

- [ ] **Step 16.6：** 手動驗收：手機 Chrome 開站 → 應跳「加到主畫面」提示。

- [ ] **Step 16.7：** Commit：

```bash
git add web/public/ web/src/app/layout.tsx web/src/app/register-sw.tsx
git commit -m "feat(web): PWA manifest + service worker"
```

---

## Task 17: Vercel Deploy

- [ ] **Step 17.1：** Push to GitHub。
- [ ] **Step 17.2：** Vercel dashboard → Import → 選 repo → Root Directory 設 `web` → Framework 自動偵測 Next.js → Deploy。
- [ ] **Step 17.3：** Settings → Environment Variables 把 4 個變數填進去（Production + Preview）。
- [ ] **Step 17.4：** 重新 Deploy。
- [ ] **Step 17.5：** 完整 e2e 驗收（手機）：登入 → 加紀錄 → 產 QR → 另台手機掃 → 撤銷 → 重掃驗證。
- [ ] **Step 17.6：** README 補 demo URL：

```bash
echo -e "\n## Demo\n\nhttps://<your-app>.vercel.app" >> README.md
git add README.md
git commit -m "docs: add demo url"
git push
```

---

## Task 18: Monkey Test（依 progress.md 原則必跑）

不寫成 code，**手動跑**，意外行為記到 `tasks/lessons.md`：

- [ ] 上傳 0 byte 檔
- [ ] 上傳 50MB+ 檔（驗 API 上限阻擋）
- [ ] QR 過期當下那秒掃
- [ ] 同 grantId 連發兩次（強制重複，預期 PDA 衝突）
- [ ] 醫師端離線掃 QR
- [ ] Privy session 過期中途按儲存
- [ ] 飛航模式新增（預期失敗 + 可重試）
- [ ] iOS Safari Private Mode（IndexedDB 預期報錯）
- [ ] 篡改 IndexedDB contentHash → 醫師端應紅色「指紋不符」
- [ ] 短時間連按 5 次儲存（UI 應 disable）

---

## Task 19: 收尾

- [ ] **Step 19.1：** 更新 `tasks/progress.md`：
  - 「下一步：前端 MVP」移到 Recently Completed
  - Monkey test 結果歸納寫入 Notes
  - 新增下一階段 TODO（GrantIndex PDA 升級、家人帳號、PDF 匯出）

- [ ] **Step 19.2：** README 加章節：Demo Flow 3 步驟 / Trade-offs / Pitch 三句話。

- [ ] **Step 19.3：** Commit：

```bash
git add tasks/progress.md README.md
git commit -m "docs: hackathon submission - progress + readme"
```

---

## 風險清單（給 executor 看）

| 風險 | 緩解 |
|---|---|
| Privy Solana SDK API 跟此 plan 名稱略有出入 | 以官方文件為準，hook 名稱不同照改 |
| Anchor TS client `i64` 用 `BN`（已在 Task 13 用） | 跑不通先 `console.log(program.idl)` 對照 |
| Vercel Blob client upload 50MB 上限 | API route 已設 `maximumSizeInBytes` |
| iOS Safari IndexedDB 7 天清除 | 已知，spec 揭露 |
| html5-qrcode 在 iOS Safari 鏡頭權限要 HTTPS | Vercel 自動 HTTPS；本地測用 ngrok 或 `next dev --experimental-https` |
| Service worker 快取跨 origin 導致看到舊鏈上資料 | sw fetch handler 已限制只 cache 同 origin GET |
| `program.account as any` 型別逃逸 | hackathon 接受；正式版用 anchor codegen 拿真型別 |

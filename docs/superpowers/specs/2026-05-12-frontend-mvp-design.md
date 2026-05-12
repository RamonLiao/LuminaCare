# Portable Health — Frontend MVP Design

**Date**: 2026-05-12
**Status**: Approved (brainstorming phase)
**Scope**: Hackathon demo MVP. Patient PWA + doctor viewer, integrated with existing `portable_health` Anchor program on Solana devnet.

---

## 1. Goals & Non-Goals

### Goals
- 病人端 3 Tab PWA，每 tab 1–2 個核心功能。
- 醫師端零安裝 web viewer，掃 QR 即看病歷。
- 完整跑通鏈上三個 ix（`anchor_record` / `issue_grant` / `revoke_grant`）。
- Demo 可在手機 Safari/Chrome 上直接執行（Vercel 部署）。

### Non-Goals（hackathon 不做）
- 排程通知 / 回診提醒實作（顯示 mock 即可）
- 家人帳號 / multi-profile
- PDF 匯出（顯示 toast「即將推出」）
- 離線錄音同步邏輯（只做 retry queue 框架，不做完整 sync）
- Unit test / E2E test（手動 checklist + monkey test）
- Re-encryption proxy 防醫師外流（trade-off，demo 講出來）

---

## 2. Tech Stack

| 層 | 選型 | 理由 |
|---|---|---|
| Framework | Next.js 16 (App Router) | Vercel 一鍵部署、PWA 友善、SSR/CSR 混搭 |
| 樣式 | Tailwind 4 + shadcn/ui | mobile-first、bottom tab bar 自刻 |
| Wallet | `@privy-io/react-auth` (Solana) | embedded wallet、social login、Solana first-class |
| Chain | `@solana/web3.js` + Anchor TS client | IDL 從 `target/idl/portable_health.json` 生 |
| 儲存 | Vercel Blob | 同 Vercel 生態、signed upload |
| 加密 | Web Crypto API (AES-GCM 256) | 原生、不引第三方 |
| QR | `qrcode` (產) + `html5-qrcode` (掃) | 成熟穩定 |
| PWA | manifest + 手寫 service worker | 不引 `next-pwa`，避免 Next 16 相容性踩雷 |
| RPC | Helius free tier (備援) + `api.devnet.solana.com` | 防 demo 當天 rate limit |

---

## 3. App 結構

```
app/
  (patient)/                    ← Privy auth required，wrap PrivyProvider
    layout.tsx                  ← bottom tab bar（今日/病歷/我）
    today/page.tsx              ← Tab 1
    records/page.tsx            ← Tab 2 列表
    records/[id]/page.tsx       ← 單筆詳情 + 「分享」入口
    records/share/page.tsx      ← 選紀錄 → 設過期 → 產 QR
    me/page.tsx                 ← Tab 3
  viewer/                       ← 醫師端，無需登入
    page.tsx                    ← 掃 QR
    [grantId]/page.tsx          ← 解密 + 顯示
  api/
    blob/upload/route.ts        ← Vercel Blob signed upload token
  login/page.tsx                ← Privy login 落地頁
lib/
  anchor/
    client.ts                   ← AnchorProvider + Program 工廠
    idl.ts                      ← import IDL JSON + types
  crypto/
    aes.ts                      ← encrypt / decrypt / generateKey / hash
  solana/
    connection.ts               ← Connection singleton + RPC fallback
  blob/
    upload.ts                   ← client-side upload helper
  storage/
    indexeddb.ts                ← Dexie wrapper：local record metadata
  privy/
    config.ts                   ← appId、loginMethods、Solana cluster
public/
  manifest.json                 ← PWA manifest
  sw.js                         ← service worker（cache shell）
```

**為什麼 `(patient)` 跟 `viewer` 平行 route group**：
兩端使用者完全不同。病人需要 Privy session，醫師零安裝、無 session。`(patient)` group 內 wrap `<PrivyProvider>`，`viewer` 不 wrap，避免醫師端載入無謂 SDK。

---

## 4. Data Model

### IndexedDB Schema (Dexie)
```ts
table records {
  recordId: string (uuid v4)       // 本地 id
  pdaAddress: string               // chain HealthRecord PDA
  blobUrl: string                  // Vercel Blob URL
  aesKey: ArrayBuffer (32 bytes)   // 加密金鑰，僅本地
  iv: ArrayBuffer (12 bytes)
  contentHash: Uint8Array (32 bytes)
  version: number (u32)
  kind: 'photo' | 'audio' | 'text'
  preview: string                  // 文字摘要 / 照片縮圖 base64
  createdAt: number
  txSig: string
}

table grants {
  grantId: string (uuid 16 byte hex)
  pdaAddress: string               // chain AccessGrant PDA
  recordIds: string[]
  granteeLabel: string             // 顯示用，未 hash
  expiresAt: number
  revoked: boolean
  bundleUrl: string                // grant bundle blob URL
  bundleKey: ArrayBuffer (32 bytes)
  qrPayload: string                // base64 of QR JSON
  createdAt: number
}
```

### QR Payload 格式
```json
{
  "v": 1,
  "grantId": "hex16",
  "patientPubkey": "base58",       // MVP 採 A 方案，正式版改 GrantIndex PDA 移除（見 Flow C / Trade-offs #2）
  "bundleUrl": "https://...",
  "bundleKey": "base64",
  "iv": "base64",
  "programId": "EtT9N7bf5YgEqHDBDkSTSGusZFEbKWiPdNNTkg2Nx8dA",
  "cluster": "devnet"
}
```

### Grant Bundle (encrypted blob 內容)
```json
{
  "records": [
    {
      "recordId": "...",
      "pdaAddress": "...",
      "blobUrl": "...",
      "aesKey": "base64",
      "iv": "base64",
      "kind": "photo",
      "createdAt": 1715500000
    }
  ]
}
```

---

## 5. Core Flows

### Flow A：新增病歷
```
[Tab 今日 → + 按鈕 → 選擇拍照/打字/錄音]
  1. 取得 raw bytes（File / Blob / string→Uint8Array）
  2. Web Crypto: crypto.subtle.generateKey AES-GCM 256
  3. iv = crypto.getRandomValues(12 bytes)
  4. ciphertext = AES-GCM encrypt(rawBytes, aesKey, iv)
  5. POST /api/blob/upload → 拿 client upload token → upload(ciphertext)
  6. contentHash = SHA-256(ciphertext) → 32 bytes
  7. version = 上一筆 version + 1（從 IndexedDB 查）
  8. Privy: program.methods.anchorRecord(contentHash, version).rpc()
  9. IndexedDB 寫入 record entry（含 aesKey、iv、blobUrl、pdaAddress、txSig）
  10. UI 跳「儲存成功」，回 Tab 今日
```

**錯誤分支**：
- step 5 失敗 → 標記 `pendingUpload`，service worker queue retry
- step 8 失敗 → 同上 + UI toast「網路忙碌，已存本地」

### Flow B：授權給醫師（產 QR）
```
[Tab 病歷 → 「分享給醫師」→ 勾選 N 筆 → 設 expires_at → 確認]
  1. grantId = crypto.getRandomValues(16 bytes) → hex
  2. 從 IndexedDB 取 N 筆 record 的 { blobUrl, aesKey, iv, ... }
  3. bundleJson = JSON.stringify({ records: [...] })
  4. bundleKey = crypto.subtle.generateKey AES-GCM 256
  5. bundleIv = random 12 bytes
  6. bundleCipher = AES-GCM encrypt(bundleJson, bundleKey, bundleIv)
  7. upload bundleCipher → bundleUrl
  8. granteeLabelHash = SHA-256(granteeLabel || grantId)
     // grantee label 例：「陳醫師 / 台大內科」，hash 後上鏈，鏈上不存明文
  9. Privy: program.methods.issueGrant(
       grantId, recordIds, granteeLabelHash, expiresAt
     ).rpc()
  10. qrPayload = base64(JSON.stringify({ v:1, grantId, bundleUrl, bundleKey:base64, iv:bundleIv:base64, programId, cluster:'devnet' }))
  11. 顯示 QR code（qrcode lib）+ expires 倒數
  12. IndexedDB 寫入 grant entry
```

### Flow C：醫師端解密
```
[/viewer → 開鏡頭 → 掃 QR]
  1. parse QR JSON
  2. derive AccessGrant PDA = ['grant', patient.key, grantId]
     // 但醫師不知道 patient pubkey！
     // → QR 額外帶 patient pubkey OR 改用 grantId 索引（鏈上加 mapping）
  3. fetch AccessGrant account → 驗 revoked === false && now < expires_at
  4. fetch bundleUrl → AES decrypt 得 records list
  5. for each record:
       fetch blobUrl → ciphertext
       SHA-256(ciphertext) === HealthRecord.content_hash ? 顯示 : 警示
       AES decrypt 用 bundle 內的 aesKey + iv → 顯示
  6. UI：清楚標示「來自鏈上驗證」+ tx 連結（醫師信任度提升）
```

**⚠️ 設計待確認**：步驟 2 醫師需要 patient pubkey 才能算 PDA。兩個解法：
- **A**：QR 多帶 `patientPubkey`（簡單，但洩漏病人地址）
- **B**：鏈上加 `GrantIndex` PDA，seed = `['grant_idx', grantId]`，存 patient pubkey（要改合約）
→ **MVP 採 A**，正式產品換 B。**這要在 Plan 階段標記。**

### Flow D：撤銷授權
```
[Tab 病歷 → 授權中 → 點某筆 → 撤銷]
  1. Privy: program.methods.revokeGrant(grantId).rpc()
  2. IndexedDB 更新 grant.revoked = true
  3. UI 立即灰掉那張 grant 卡片
```
**Trade-off 如 Flow C 註記：已掃過 QR 的醫師仍能解密內容（key 已給出去）。靠醫師端誠實檢查 `revoked` flag，UI 拒顯示。Demo / pitch 主動講。**

---

## 6. 三個 Tab 功能矩陣

| Tab | 功能 1 | 功能 2 |
|---|---|---|
| **今日** | 「+ 新增今日紀錄」(Flow A) | Mock 服藥/回診提醒（hardcoded 陣列，UI 真實，邏輯假） |
| **病歷** | 列表 + 詳情頁 | 「分享給醫師」(Flow B + D) |
| **我** | Privy 用戶資訊 + 登出 | 「PDF 匯出」按鈕→ toast「即將推出」（佔位）|

---

## 7. Error Handling

| 場景 | 處理 |
|---|---|
| Privy 登入失敗 | fallback email magic link 連結 |
| Devnet RPC timeout | retry 3 次 exp backoff → 「網路忙碌，已存本地」+ 排隊 |
| Blob upload 失敗 | 同上排隊（service worker retry） |
| Anchor tx 失敗 (program error) | 顯示 error code 對應人話訊息（map error.rs 5 codes） |
| 醫師掃過期 grant | 紅色全屏「此授權已失效」 |
| 醫師掃 revoked grant | 同上 |
| 醫師掃 hash mismatch | 紅色警示「資料可能被竄改，請聯繫病人」（核心存證價值展示） |
| 鏡頭權限拒絕 | 提示「請允許相機權限」+ 教學連結 |

---

## 8. Testing Strategy

**不寫 automated test**（hackathon 時間）。

### 手動 Happy Path Checklist（README 內）
1. Privy 登入（Google + email 兩種）
2. 新增照片病歷
3. 新增文字病歷
4. 列表正確顯示
5. 選 2 筆病歷產 QR
6. 另一台手機掃 QR → 看到 2 筆
7. 撤銷 grant → 再掃同 QR → 顯示已失效
8. 改 IndexedDB 偽造 contentHash → 醫師端紅色警示

### Monkey Test（必跑）
- 拍 0 byte 檔
- 上傳 50MB 大檔（Vercel Blob 限制？要查）
- QR 過期當下那秒掃
- 同 grant_id 連發兩次 issue（應撞 PDA already exists）
- 醫師端離線掃 QR
- Privy session 過期中途新增病歷
- 飛航模式新增病歷 → 開網路 → queue 應自動 flush
- Safari Private Mode（IndexedDB 行為怪）

---

## 9. Deployment

- **Vercel** 主部署，自動接 git push
- 環境變數：`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_RPC_PRIMARY`, `NEXT_PUBLIC_RPC_FALLBACK`, `BLOB_READ_WRITE_TOKEN`
- **Demo URL**：`https://portable-health.vercel.app`
- 醫師端同 domain `/viewer`

---

## 10. 已知 Trade-offs（demo 主動講）

1. **QR 洩漏後鏈上 revoke 無效**：grantKey 給出去就拿不回，靠醫師誠實檢查。正式版需 re-encryption proxy 或 lit protocol。
2. **Patient pubkey 寫進 QR**：見 Flow C 註記。正式版加 `GrantIndex` PDA。
3. **AES key 只存單一裝置**：換手機就讀不到舊病歷。正式版需 Privy embedded storage 或 user-controlled backup。
4. **無排程通知**：MVP 用 mock。正式版接 web push API + service worker。
5. **無多人帳號**：家人帳號要靠 Privy 多 wallet 切換或 sub-account 模型，未做。

---

## 11. 後續工作 (out of this spec)

- 進 writing-plans 拆 implementation 步驟
- 評估是否要回頭改合約加 `GrantIndex` PDA（影響 Flow C）
- Privy app 註冊 + Vercel project 建立（環境準備）

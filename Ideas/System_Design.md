# Portable Health Agent — 系統設計書

## 設計原則

1. **Web3 完全藏在底層**。UI 字典裡沒有 wallet / hash / chain / tx 等字眼。
2. **Solana 是「公證機器」，不是儲存層**。鏈上只放 hash 與授權事件。
3. **Happy path ≤ 3 tap** 完成核心動作（錄音 → 結束 → 存）。

---

## 一、Solana 角色定義

### 1.1 鏈上只做三件事

| # | 事件 | 鏈上資料 | 為什麼非鏈不可 |
|---|---|---|---|
| 1 | **病歷存證** (Anchor Record) | `record_id`, `sha256(encrypted_blob)`, `patient_pubkey`, `timestamp` | 病患在公司倒閉/被駭時，仍能向第三方證明病歷在 X 時間存在且未被改 |
| 2 | **授權發放** (Grant) | `grant_id`, `record_id(s)`, `grantee_label_hash`, `expires_at` | 醫師端可獨立驗證授權有效，不用相信我們 server |
| 3 | **授權撤銷** (Revoke) | `grant_id`, `revoked_at` | 撤銷必須是公開可驗證事件 |

### 1.2 鏈下完全處理的東西（不要碰鏈）

- 病歷內容、附件、錄音 → 病患手機 + 加密雲備份（S3/IPFS）
- AI 摘要計算 → 後端或 on-device
- 使用者帳號、profile、推播 → Postgres
- 計費、訂閱 → Stripe
- 解密金鑰交換 → 用 Solana 公鑰加密的 envelope 走 HTTPS

### 1.3 不要做的事

| ❌ | 理由 |
|---|---|
| 發 token | 沒 utility，會被當證券 |
| NFT 病歷 | mint 費 + UX 災難 |
| cNFT/Compressed | 一般 PDA 帳號夠便宜（~0.002 SOL/筆），複雜度不值得 |
| on-chain identity | 病患身份用 passkey + email |
| SOL 支付 | Web2 使用者不會買 SOL，用 Stripe |

### 1.4 私鑰管理（最關鍵 UX 摩擦點）

優先序：

1. **首選：Privy / Turnkey / Magic 之類的 embedded wallet**
   - Email/Apple/Google 登入 → 後端 MPC 或 TEE 託管 key shard
   - 使用者完全感受不到 wallet 存在
2. **次選：自建 passkey + KMS**（iOS Secure Enclave）
3. **絕對不要**：助記詞、Phantom、Solflare 連接

**家屬代管**：把 record viewing key 用家屬 pubkey 加密後存到鏈下 DB，UI 寫成「**讓家人也能看**」。不做 on-chain multisig。

### 1.5 Hackathon 評審話術

> 「病歷的可信度不能依賴我們公司的存在。如果我們明天倒閉、被駭、被法院下令，病患拿著手機裡的加密檔案 + Solana 上的 hash + 時間戳，仍能向任何第三方醫療機構證明這份病歷的真實性。Solana 提供的是『**患者主權的可驗證性**』，這是中心化 DB 結構上做不到的。我們選 Solana 而非以太坊，是因為單筆存證成本 < $0.001 + 400ms finality，符合就醫場景的即時性需求。」

### 1.6 系統邊界

```
[手機 App]
  ├─ 錄音 → 雲端 ASR+LLM → 摘要回傳
  ├─ 加密(摘要+附件) → 上傳 S3 + 計算 hash
  ├─ 呼叫 anchor_record(hash) → Solana ←─ 鏈上互動點 (1)
  └─ 顯示「已備份 ✓」

[分享流程]
  ├─ 病患點分享 → issue_grant() ←──── 鏈上互動點 (2)
  ├─ App 生成 QR (含 grant_id + 解密 envelope)
  ├─ 醫師掃 QR → web viewer
  │    └─ viewer 從 Solana 讀 grant 驗證有效性
  │    └─ 從 S3 抓加密檔，用 envelope 解密
  └─ 病患可隨時 revoke_grant() ←──── 鏈上互動點 (3)
```

使用者只在三個時刻碰鏈：**存病歷、授權、撤銷**。其他 99% 操作走 Web2 stack。

---

## 二、Anchor Program 規格

### 2.1 帳戶模型

```rust
// PDA: ["record", patient_pubkey, record_id]
struct HealthRecord {
    patient: Pubkey,           // 病患控制鑰
    content_hash: [u8; 32],    // sha256 of encrypted blob
    created_at: i64,
    version: u8,
    // 不存 provider_id 明文（隱私）
    // 不存科別（隱私）
}

// PDA: ["grant", grant_id]
struct AccessGrant {
    patient: Pubkey,
    record_ids: Vec<[u8;32]>,        // 支援多筆，給「自訂範圍」用
    grantee_label_hash: [u8; 32],    // 「馬偕王醫師」字串 hash，便於對應
    expires_at: i64,
    revoked: bool,
    // 不綁 grantee_pubkey — 醫師沒 wallet，QR 是一次性 token
}
```

### 2.2 Instructions

```rust
fn anchor_record(content_hash: [u8;32]) -> record_id
fn issue_grant(record_ids: Vec<[u8;32]>, expires_at: i64, grantee_label_hash: [u8;32]) -> grant_id
fn revoke_grant(grant_id: [u8;32])
```

整個 program ~200 行 Rust。

---

## 三、MVP Wireframe

### 3.1 全域結構

**3 Tabs（底部）**：`今日` ｜ `病歷` ｜ `我`

不要 4 Tab、不要漢堡選單、不要側邊欄。

### 3.2 Tab 1：今日（Home）

```
┌─────────────────────────────┐
│  早安，明華                  │
│                             │
│   ┌─────────────────────┐   │
│   │      🎤             │   │  ← 主 CTA，60% 螢幕
│   │  我要記錄這次看診    │   │
│   └─────────────────────┘   │
│                             │
│  ─── 上次看診 ───            │
│  ┌─────────────────────┐   │
│  │ 4/28 馬偕 心臟科     │   │
│  │ 「血壓控制良好，續藥」│   │
│  └─────────────────────┘   │
│                             │
├──────┬──────┬──────────────┤
│ 今日  │ 病歷 │   我         │
└─────────────────────────────┘
```

**第一次開 App**：上次看診卡片換成引導文字「按上面那顆按鈕，開始你第一次記錄 →」。不要 onboarding tutorial。

**鏈上行為**：無

### 3.3 Tab 1.1：錄音中

**首次進入權限 sheet**：
```
🎤  記錄這次看診
按下後會開始錄音，只有你看得到。
錄音會在摘要完成後刪除。

[  開始錄音  ]
[  先不要    ]
```

**錄音中**：
```
       00:04:23
    正在為你記錄...
     ▁▃▅▇▅▃▁

  ┌──────────────────┐
  │  🔴 結束錄音      │
  └──────────────────┘
```

**結束後 loading**（30 秒內，必畫進度，否則使用者以為當機）：
```
AI 正在整理重點…(約 30 秒)

✓ 轉文字完成
⏳ 整理重點中...
⚪ 加密儲存
```

**鏈上行為**：無

### 3.4 Tab 1.2：摘要確認頁

```
✕               4/28 看診
📋 這次看診重點

主訴
胸悶、走路會喘 2 週            ✏️ 改
─────────────
醫師評估
疑似輕度心律不整，安排心電圖追蹤  ✏️ 改
─────────────
用藥
• Concor 2.5mg 每天 1 次
• Aspirin 100mg 每天 1 次     ✏️ 改
─────────────
下次回診  2026/5/15            ✏️ 改

💬 補充備註（選填）
[                          ]

┌──────────────────────┐
│   存這次看診          │
└──────────────────────┘
```

**設計重點**：
- 預設 happy path 是滑下去 → 按存
- 「✏️ 改」按了才出現編輯框，不要預設都 editable
- 不出現「鏈上」「hash」「加密」字樣

**鏈上行為**：點「存這次看診」→ `anchor_record(content_hash)`，存完跳「✓ 已備份」toast。

### 3.5 Tab 2：病歷時間軸

```
我的病歷           🔍

─── 2026 年 4 月 ───
┌─────────────────────┐
│ 4/28 (一)            │
│ 馬偕醫院 · 心臟內科  │
│ 胸悶評估，續藥追蹤   │
│ ✓ 已備份              │  ← 不寫「上鏈」
└─────────────────────┘

┌─────────────────────┐
│ 4/12 (六)            │
│ 診所 · 家醫科        │
│ 感冒，3 天份藥       │
│ ✓ 已備份              │
└─────────────────────┘
```

**設計重點**：沒有篩選器、沒有 Tab、沒有科別分類。直接時間軸。「已備份」用淡綠色小字。

### 3.6 Tab 2.1：病歷詳細頁

```
←       4/28 心臟科

📋 看診重點
[同摘要頁的結構化內容]

📎 附件 (2)
[處方箋][心電圖]

┌──────────────────────┐
│  📤 分享給醫師        │  ← 主 CTA
└──────────────────────┘

╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴
進階資訊  ▽          ← 摺疊
```

**進階資訊展開**（一般使用者不會點）：
```
• 已防竄改備份 ✓
• 備份時間：2026/4/28 15:32
• 驗證碼：5fa3...8b21 (複製)
• [ 查看驗證紀錄 ]  ← 連 Solana Explorer
```

### 3.7 Tab 2.2：分享流程

點「分享給醫師」→ Bottom Sheet：
```
📤 分享給醫師

●  只給這位醫師看 30 分鐘    ← 預選
○  給這位醫師看 7 天
○  自訂

[    產生 QR Code    ]
```

QR Code 全屏：
```
←   讓醫師掃這個 QR Code

    ┌───────────┐
    │  QR Code   │
    └───────────┘

    29:48 後失效     ← 倒數

[ 改用 PDF 分享 ]    ← 逃生口
[ 取消授權 ]
```

**設計重點**：
- 預設選項就是 80% 場景（單次門診），不要逼使用者選
- PDF 逃生口必備 — 老醫師不會掃 QR
- 倒數計時讓使用者放心

**鏈上行為**：
- 產生 QR → `issue_grant(record_ids, expires_at, grantee_label_hash)`
- 取消授權 → `revoke_grant(grant_id)`

### 3.8 Tab 3：我

```
👤  陳明華
    ming@gmail.com
─────────────────
👨‍👩‍👧 家人帳號          ← v2，UI 預留
   幫爸媽管理病歷

📋 授權紀錄
   誰看過你的病歷

⚙️ 設定
❓ 常見問題
─────────────────
v0.1.0
```

**授權紀錄頁**：
```
←   授權紀錄

進行中
┌─────────────────────┐
│ 馬偕 王醫師          │
│ 4/28 15:30 至今      │
│ 還有 18 分鐘         │
│           [ 取消 ]   │
└─────────────────────┘

歷史
┌─────────────────────┐
│ 馬偕 王醫師          │
│ 4/12 看過 1 次       │
└─────────────────────┘
```

**鏈上行為**：取消按鈕 → `revoke_grant()`

---

## 四、開發順序建議

```
Day 0 (2hr):  Anchor devnet hello world（熱身）
Day 1:        Wireframe 3 Tab + 關鍵 flow（已完成）
Day 1 末:     review wireframe → 凍結 record/grant 資料結構（已完成）
Day 2-3:      Anchor program + 前端並行
Day 4+:       Web viewer (醫師端) + QR 流程
```

---

## 五、待補的 Edge Case（後續）

- 登入註冊流程（Privy 接入細節）
- 家人帳號 / 多人代管權限模型
- PDF 匯出版型
- 醫師 web viewer 畫面
- 離線錄音 → 上線同步邏輯

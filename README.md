# LuminaCare

**Your medical history, in your pocket — verifiable on Solana, readable by any doctor in three seconds.**

## Pitch

1. **Patients own their records, not hospitals.** Encrypted on the patient's device, attested on Solana, shared by QR — no app, no wallet, no login on the doctor's side.
2. **Revocation is the access-control primitive, not key custody.** One tap flips the on-chain grant; the same QR turns red instantly, on every device, forever.
3. **Built for the people hospitals ignore.** Family carers of chronic patients are the wedge — pharmacies and long-term-care centres are the channel, not hospital BD.

Patients carry their own encrypted records. When they visit a doctor, they show a QR code. The doctor scans it on any browser — no app, no wallet, no login — and sees the records, plus a green tick proving the patient is the rightful owner. Revoke access in one tap and the same QR turns red instantly.

The chain stores three things: a tamper-proof fingerprint of each record, the grant, and the revocation. The records themselves never leave the patient's device unencrypted.

## Live demo

- **App:** https://lumina-care-sol.vercel.app
- **Program (devnet):** [`EtT9N7bf5YgEqHDBDkSTSGusZFEbKWiPdNNTkg2Nx8dA`](https://solscan.io/account/EtT9N7bf5YgEqHDBDkSTSGusZFEbKWiPdNNTkg2Nx8dA?cluster=devnet)
- **Sample tx (record attestation):** [solscan ↗](https://solscan.io/tx/3FDubTypSdEfziRmFURnW9bnsq92jF7Uq1ZtLK9fxPLF8tCqZY6fyMnJBmaao2RwwwArXBCaX7HBGs2R3PQpbhZF?cluster=devnet)

### Try it in 90 seconds

1. Open the app, sign in (Privy embedded wallet — no seed phrase).
2. Add a record. Watch the on-chain attestation tx land.
3. Tap **Share with doctor**, enter a label, generate a QR.
4. Scan the QR on a second device (or an Incognito window). You see the records and a green **"Verified on-chain"** banner.
5. Back on the patient device, tap **Revoke**. Refresh the doctor view — same URL, now a red **"Access revoked"** banner.

## Why this matters

Existing health-record exchanges are built around hospitals trusting other hospitals. Patients are the asset, not the customer. LuminaCare flips that: the patient holds the keys, the chain holds the proof, and the doctor needs nothing but a browser.

Initial market: family carers of patients with chronic conditions in Taiwan. Channels: chronic-disease Facebook groups, long-term-care centres, pharmacy partnerships. We do not chase hospital BD.

## Architecture in one breath

```
Patient device                          Solana devnet                Doctor browser
─────────────                          ──────────────                ──────────────
encrypt (AES-GCM)  ──── content_hash ────▶ HealthRecord PDA
upload ciphertext  ──────────────────────▶ Vercel Blob (public)
issue grant        ──── grant_id, label_hash, expires_at ─▶ AccessGrant PDA
                                                                     ▲
                                  QR (payload: bundle URL + AES key) ┘
                                                                     │
                                            fetch AccessGrant ◀──────┤
                                            decrypt locally ◀────────┤
revoke             ──── revoked=true ────▶ AccessGrant PDA           │
                                                  ▲                  │
                                            re-check ────────────────┘
```

## Anchor program

Three instructions, two accounts, five error codes — nothing more.

- `anchor_record(content_hash: [u8; 32], version: u32)` — patient stamps a record fingerprint.
- `issue_grant(grant_id: [u8; 16], record_ids: Vec<Pubkey>, grantee_label_hash: [u8; 32], expires_at: i64)` — patient issues a time-bounded grant.
- `revoke_grant()` — patient flips `revoked = true` on the grant PDA. The account is **not** closed — audit trail is the point.

PDAs:

- `HealthRecord`: `["record", patient, version_le]`
- `AccessGrant`: `["grant", patient, grant_id]`

## Trade-offs we made on purpose

| Choice | Reason |
|---|---|
| No NFTs, no tokens, no SOL payments | Health records are not collectibles. Tokenising them invites the wrong incentives and the wrong regulators. |
| Records ciphertext on Vercel Blob, not Arweave/IPFS | Demo latency and cost. The chain holds the hash; the blob store is replaceable. Permanence at the blob layer is not a security property. |
| `AccessGrant` does not bind a grantee public key | Doctors do not have wallets and will not get them. We bind a hash of the doctor's label instead, so revocation is what enforces access — not key custody. |
| Privy embedded wallet, no seed phrase shown | The product never uses the words *wallet*, *hash*, *chain*, *tx*, or *encryption*. We say "tamper-proof backup" and "medical-grade attestation". |
| QR carries the patient pubkey | A simplification for the hackathon. Production would add a `GrantIndex` PDA so the viewer can resolve from `grant_id` alone. |
| Three-tab UI: Today / Records / Me | Happy path is ≤ 3 taps. Anything else got cut. |

## Stack

- **Chain:** Anchor 1.0 on Solana devnet. Tests with `litesvm` (six cases including unauthorised-write and double-revoke). Program ID frozen at deploy.
- **Web:** Next.js 16 (App Router, Turbopack), Tailwind 4, shadcn/ui on `@base-ui/react`, Privy for embedded wallets, `@coral-xyz/anchor` 0.32, Vercel Blob (public store), Dexie for local state, Web Crypto for AES-GCM and SHA-256.
- **PWA:** custom service worker, network-first, cached fallback.

## Repository layout

```
chain/portable_health/    Anchor 1.0 program + litesvm tests
web/                      Next.js 16 app (deployed on Vercel)
Ideas/                    PRD, system design, GTM analysis
```

## Local development

```bash
# Chain
cd chain/portable_health
anchor build
anchor test                # uses surfpool (brew install txtx/taps/surfpool)

# Web
cd web
pnpm install
pnpm dev                   # needs NEXT_PUBLIC_PRIVY_APP_ID + BLOB_READ_WRITE_TOKEN
```

## Status

Built for the 2026 Solana Frontier hackathon. Devnet only. Not audited. Do not put real medical records in it.

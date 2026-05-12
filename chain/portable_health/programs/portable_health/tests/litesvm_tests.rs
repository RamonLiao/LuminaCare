use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use portable_health::{
    constants::{GRANT_SEED, RECORD_SEED},
    state::{AccessGrant, HealthRecord},
    ID as PROGRAM_ID,
};
use solana_clock::Clock;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;

const PROGRAM_SO: &[u8] =
    include_bytes!("../../../target/deploy/portable_health.so");

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program(PROGRAM_ID, PROGRAM_SO).unwrap();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    (svm, payer)
}

fn record_pda(patient: &Pubkey, version: u32) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[RECORD_SEED, patient.as_ref(), &version.to_le_bytes()],
        &PROGRAM_ID,
    )
}

fn grant_pda(patient: &Pubkey, grant_id: &[u8; 16]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[GRANT_SEED, patient.as_ref(), grant_id],
        &PROGRAM_ID,
    )
}

fn send_ix(
    svm: &mut LiteSVM,
    ix: Instruction,
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> Result<(), litesvm::types::FailedTransactionMetadata> {
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &bh);
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend(extra_signers);
    let tx = Transaction::new(&signers, msg, bh);
    svm.send_transaction(tx).map(|_| ())
}

fn anchor_record_ix(patient: &Pubkey, content_hash: [u8; 32], version: u32) -> Instruction {
    let (record, _) = record_pda(patient, version);
    let accounts = portable_health::accounts::AnchorRecord {
        patient: *patient,
        record,
        system_program: solana_system_interface::program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: portable_health::instruction::AnchorRecord {
            content_hash,
            version,
        }
        .data(),
    }
}

fn issue_grant_ix(
    patient: &Pubkey,
    grant_id: [u8; 16],
    record_ids: Vec<Pubkey>,
    grantee_label_hash: [u8; 32],
    expires_at: i64,
) -> Instruction {
    let (grant, _) = grant_pda(patient, &grant_id);
    let accounts = portable_health::accounts::IssueGrant {
        patient: *patient,
        grant,
        system_program: solana_system_interface::program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: portable_health::instruction::IssueGrant {
            grant_id,
            record_ids,
            grantee_label_hash,
            expires_at,
        }
        .data(),
    }
}

fn revoke_grant_ix(patient: &Pubkey, grant: Pubkey) -> Instruction {
    let accounts = portable_health::accounts::RevokeGrant {
        patient: *patient,
        grant,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: portable_health::instruction::RevokeGrant {}.data(),
    }
}

fn fetch<T: anchor_lang::AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).expect("account missing");
    T::try_deserialize(&mut acc.data.as_slice()).expect("deserialize failed")
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

// ---------- Tests ----------

#[test]
fn happy_path_anchor_issue_revoke() {
    let (mut svm, patient) = setup();
    let p = patient.pubkey();

    // anchor record v1
    let hash = [7u8; 32];
    send_ix(&mut svm, anchor_record_ix(&p, hash, 1), &patient, &[]).unwrap();
    let (rec_pk, _) = record_pda(&p, 1);
    let rec: HealthRecord = fetch(&svm, &rec_pk);
    assert_eq!(rec.patient, p);
    assert_eq!(rec.content_hash, hash);
    assert_eq!(rec.version, 1);

    // issue grant
    let gid = [9u8; 16];
    let expires = now(&svm) + 3600;
    send_ix(
        &mut svm,
        issue_grant_ix(&p, gid, vec![rec_pk], [1u8; 32], expires),
        &patient,
        &[],
    )
    .unwrap();
    let (g_pk, _) = grant_pda(&p, &gid);
    let g: AccessGrant = fetch(&svm, &g_pk);
    assert_eq!(g.patient, p);
    assert_eq!(g.record_ids, vec![rec_pk]);
    assert_eq!(g.expires_at, expires);
    assert!(!g.revoked);

    // revoke
    send_ix(&mut svm, revoke_grant_ix(&p, g_pk), &patient, &[]).unwrap();
    let g2: AccessGrant = fetch(&svm, &g_pk);
    assert!(g2.revoked);
}

/// Edge: attacker tries to write at victim's PDA. seeds use signer.key(), so
/// passing victim's PDA with attacker as signer → ConstraintSeeds fails.
#[test]
fn unauthorized_anchor_record_seed_mismatch() {
    let (mut svm, victim) = setup();
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();

    let (victim_pda, _) = record_pda(&victim.pubkey(), 1);
    // Build ix manually: signer = attacker, record = victim's PDA.
    let accounts = portable_health::accounts::AnchorRecord {
        patient: attacker.pubkey(),
        record: victim_pda,
        system_program: solana_system_interface::program::ID,
    };
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: portable_health::instruction::AnchorRecord {
            content_hash: [0u8; 32],
            version: 1,
        }
        .data(),
    };
    let err = send_ix(&mut svm, ix, &attacker, &[]).unwrap_err();
    let logs = format!("{:?}", err);
    assert!(
        logs.contains("ConstraintSeeds") || logs.contains("2006"),
        "expected seeds error, got: {logs}"
    );
}

/// Edge: A 不能撤銷 B 的 grant（has_one = patient）
#[test]
fn unauthorized_revoke_by_third_party() {
    let (mut svm, patient_a) = setup();
    let pa = patient_a.pubkey();
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();

    // A issues a grant
    let gid = [3u8; 16];
    let expires = now(&svm) + 3600;
    send_ix(
        &mut svm,
        issue_grant_ix(&pa, gid, vec![], [0u8; 32], expires),
        &patient_a,
        &[],
    )
    .unwrap();
    let (g_pk, _) = grant_pda(&pa, &gid);

    // attacker tries to revoke
    let accounts = portable_health::accounts::RevokeGrant {
        patient: attacker.pubkey(),
        grant: g_pk,
    };
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: portable_health::instruction::RevokeGrant {}.data(),
    };
    let err = send_ix(&mut svm, ix, &attacker, &[]).unwrap_err();
    let logs = format!("{:?}", err);
    // has_one violation → ConstraintHasOne (2001) or our Unauthorized custom (6002)
    assert!(
        logs.contains("ConstraintHasOne")
            || logs.contains("Unauthorized")
            || logs.contains("2001")
            || logs.contains("6002"),
        "expected has_one/unauthorized error, got: {logs}"
    );

    // ensure not revoked
    let g: AccessGrant = fetch(&svm, &g_pk);
    assert!(!g.revoked);
}

/// Edge: expires_at <= now → InvalidExpiration (code 6003)
#[test]
fn issue_grant_rejects_past_expiration() {
    let (mut svm, patient) = setup();
    let p = patient.pubkey();
    let gid = [1u8; 16];
    // expires_at = now (require_gt → fails)
    let bad_expiry = now(&svm);
    let err = send_ix(
        &mut svm,
        issue_grant_ix(&p, gid, vec![], [0u8; 32], bad_expiry),
        &patient,
        &[],
    )
    .unwrap_err();
    let logs = format!("{:?}", err);
    assert!(
        logs.contains("InvalidExpiration") || logs.contains("6003"),
        "expected InvalidExpiration, got: {logs}"
    );
}

/// Monkey: 11 筆 record_ids 超過 MAX_RECORDS_PER_GRANT(10)
/// 注意：#[max_len(10)] 算的是 InitSpace；超量時 anchor 在 deserialize 階段
/// 就因 buffer 不足 fail，所以我們的 require!(len<=10) 其實是雙保險。
#[test]
fn issue_grant_rejects_too_many_records() {
    let (mut svm, patient) = setup();
    let p = patient.pubkey();
    let gid = [2u8; 16];
    let expires = now(&svm) + 3600;
    let too_many: Vec<Pubkey> = (0..11).map(|_| Pubkey::new_unique()).collect();
    let err = send_ix(
        &mut svm,
        issue_grant_ix(&p, gid, too_many, [0u8; 32], expires),
        &patient,
        &[],
    )
    .unwrap_err();
    let logs = format!("{:?}", err);
    // 可能命中我們的 TooManyRecords(6004) 或 anchor 的 AccountDidNotSerialize
    assert!(
        logs.contains("TooManyRecords")
            || logs.contains("6004")
            || logs.contains("DidNotSerialize")
            || logs.contains("3004"),
        "expected too-many-records or serialize error, got: {logs}"
    );
}

/// Edge: revoke 一次後再 revoke → GrantRevoked (code 6001)
#[test]
fn double_revoke_fails() {
    let (mut svm, patient) = setup();
    let p = patient.pubkey();
    let gid = [5u8; 16];
    let expires = now(&svm) + 3600;
    send_ix(
        &mut svm,
        issue_grant_ix(&p, gid, vec![], [0u8; 32], expires),
        &patient,
        &[],
    )
    .unwrap();
    let (g_pk, _) = grant_pda(&p, &gid);

    send_ix(&mut svm, revoke_grant_ix(&p, g_pk), &patient, &[]).unwrap();
    svm.expire_blockhash();
    let err = send_ix(&mut svm, revoke_grant_ix(&p, g_pk), &patient, &[]).unwrap_err();
    let logs = format!("{:?}", err);
    assert!(
        logs.contains("GrantRevoked") || logs.contains("6001"),
        "expected GrantRevoked, got: {logs}"
    );
}

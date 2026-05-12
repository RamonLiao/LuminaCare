use anchor_lang::prelude::*;
use crate::constants::MAX_RECORDS_PER_GRANT;

#[account]
#[derive(InitSpace)]
pub struct AccessGrant {
    pub patient: Pubkey,
    pub grant_id: [u8; 16],
    #[max_len(MAX_RECORDS_PER_GRANT)]
    pub record_ids: Vec<Pubkey>,
    pub grantee_label_hash: [u8; 32],
    pub issued_at: i64,
    pub expires_at: i64,
    pub revoked: bool,
    pub bump: u8,
}

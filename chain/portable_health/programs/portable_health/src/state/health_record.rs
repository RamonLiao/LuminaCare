use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HealthRecord {
    pub patient: Pubkey,
    pub content_hash: [u8; 32],
    pub created_at: i64,
    pub version: u32,
    pub bump: u8,
}

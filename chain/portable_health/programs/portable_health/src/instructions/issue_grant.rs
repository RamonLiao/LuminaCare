use anchor_lang::prelude::*;
use crate::constants::{GRANT_SEED, MAX_RECORDS_PER_GRANT};
use crate::error::ErrorCode;
use crate::state::AccessGrant;

#[derive(Accounts)]
#[instruction(grant_id: [u8; 16])]
pub struct IssueGrant<'info> {
    #[account(mut)]
    pub patient: Signer<'info>,

    #[account(
        init,
        payer = patient,
        space = 8 + AccessGrant::INIT_SPACE,
        seeds = [GRANT_SEED, patient.key().as_ref(), &grant_id],
        bump,
    )]
    pub grant: Account<'info, AccessGrant>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<IssueGrant>,
    grant_id: [u8; 16],
    record_ids: Vec<Pubkey>,
    grantee_label_hash: [u8; 32],
    expires_at: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require_gt!(expires_at, now, ErrorCode::InvalidExpiration);
    require!(
        record_ids.len() <= MAX_RECORDS_PER_GRANT,
        ErrorCode::TooManyRecords
    );

    let grant = &mut ctx.accounts.grant;
    grant.patient = ctx.accounts.patient.key();
    grant.grant_id = grant_id;
    grant.record_ids = record_ids;
    grant.grantee_label_hash = grantee_label_hash;
    grant.issued_at = now;
    grant.expires_at = expires_at;
    grant.revoked = false;
    grant.bump = ctx.bumps.grant;
    Ok(())
}

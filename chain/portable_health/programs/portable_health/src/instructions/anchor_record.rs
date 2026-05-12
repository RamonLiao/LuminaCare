use anchor_lang::prelude::*;
use crate::constants::RECORD_SEED;
use crate::state::HealthRecord;

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32], version: u32)]
pub struct AnchorRecord<'info> {
    #[account(mut)]
    pub patient: Signer<'info>,

    #[account(
        init,
        payer = patient,
        space = 8 + HealthRecord::INIT_SPACE,
        seeds = [RECORD_SEED, patient.key().as_ref(), &version.to_le_bytes()],
        bump,
    )]
    pub record: Account<'info, HealthRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AnchorRecord>,
    content_hash: [u8; 32],
    version: u32,
) -> Result<()> {
    let record = &mut ctx.accounts.record;
    record.patient = ctx.accounts.patient.key();
    record.content_hash = content_hash;
    record.created_at = Clock::get()?.unix_timestamp;
    record.version = version;
    record.bump = ctx.bumps.record;
    Ok(())
}

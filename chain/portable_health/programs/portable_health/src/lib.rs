pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("EtT9N7bf5YgEqHDBDkSTSGusZFEbKWiPdNNTkg2Nx8dA");

#[program]
pub mod portable_health {
    use super::*;

    pub fn anchor_record(
        ctx: Context<AnchorRecord>,
        content_hash: [u8; 32],
        version: u32,
    ) -> Result<()> {
        instructions::anchor_record::handler(ctx, content_hash, version)
    }

    pub fn issue_grant(
        ctx: Context<IssueGrant>,
        grant_id: [u8; 16],
        record_ids: Vec<Pubkey>,
        grantee_label_hash: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        instructions::issue_grant::handler(
            ctx,
            grant_id,
            record_ids,
            grantee_label_hash,
            expires_at,
        )
    }

    pub fn revoke_grant(ctx: Context<RevokeGrant>) -> Result<()> {
        instructions::revoke_grant::handler(ctx)
    }
}

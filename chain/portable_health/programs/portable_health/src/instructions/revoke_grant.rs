use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::state::AccessGrant;

#[derive(Accounts)]
pub struct RevokeGrant<'info> {
    pub patient: Signer<'info>,

    #[account(
        mut,
        has_one = patient @ ErrorCode::Unauthorized,
    )]
    pub grant: Account<'info, AccessGrant>,
}

pub fn handler(ctx: Context<RevokeGrant>) -> Result<()> {
    let grant = &mut ctx.accounts.grant;
    require!(!grant.revoked, ErrorCode::GrantRevoked);
    grant.revoked = true;
    Ok(())
}

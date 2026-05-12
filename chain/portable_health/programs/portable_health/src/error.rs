use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Grant has expired")]
    GrantExpired,
    #[msg("Grant has been revoked")]
    GrantRevoked,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Invalid expiration timestamp")]
    InvalidExpiration,
    #[msg("Too many records in grant")]
    TooManyRecords,
}

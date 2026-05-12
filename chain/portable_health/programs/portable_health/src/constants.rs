use anchor_lang::prelude::*;

#[constant]
pub const RECORD_SEED: &[u8] = b"record";

#[constant]
pub const GRANT_SEED: &[u8] = b"grant";

pub const MAX_RECORDS_PER_GRANT: usize = 10;

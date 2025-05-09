use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BountyStatus {
    Open,
    Submitted,
    Approved,
    Cancelled,
}

#[account]
pub struct Bounty {
    pub creator: Pubkey,               // Wallet of the creator
    pub auditor: Option<Pubkey>,       // Wallet of the assigned auditor
    pub amount: u64,                   // Amount locked in the bounty
    pub status: BountyStatus,          // Open, Submitted, Approved, Cancelled
    pub report_uri: Option<String>,    // IPFS or Arweave link to the report
    pub created_at: i64,               // Unix timestamp
    pub nonce: u8,                     // For PDA derivation
    pub bump: u8,                      // PDA bump
}

impl Bounty {
    pub const MAX_REPORT_URI_SIZE: usize = 100; // Define max size for report_uri
    
    pub fn space() -> usize {
        8 +                              // Discriminator
        32 +                             // creator: Pubkey
        1 + 32 +                         // Option<Pubkey> for auditor
        8 +                              // amount: u64
        1 +                              // status (enum)
        1 + Self::MAX_REPORT_URI_SIZE +  // Option<String> for report_uri
        8 +                              // created_at: i64
        1 +                              // nonce: u8
        1                                // bump: u8
    }
} 
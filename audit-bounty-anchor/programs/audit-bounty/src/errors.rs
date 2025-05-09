use anchor_lang::prelude::*;

#[error_code]
pub enum BountyError {
    #[msg("Bounty is not in Open status")]
    BountyNotOpen,
    
    #[msg("Bounty is not in Submitted status")]
    BountyNotInReview,
    
    #[msg("Bounty is not in Approved status")]
    BountyNotCompleted,
    
    #[msg("Only creator can perform this action")]
    OnlyCreatorCanPerform,
    
    #[msg("Report URI is too long")]
    ReportLinkTooLong,
    
    #[msg("Invalid escrow account")]
    InvalidEscrowAccount,
    
    #[msg("Bounty already has an auditor assigned")]
    AuditorAlreadyAssigned,
    
    #[msg("Auto-release deadline has not been reached yet")]
    DeadlineNotReached,
} 
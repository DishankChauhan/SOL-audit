use solana_program::{program_error::ProgramError, decode_error::DecodeError};
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum BountyError {
    #[error("Invalid instruction")]
    InvalidInstruction,

    #[error("Not rent exempt")]
    NotRentExempt,

    #[error("Invalid bounty amount")]
    InvalidBountyAmount,

    #[error("Invalid deadline")]
    InvalidDeadline,

    #[error("Bounty already initialized")]
    BountyAlreadyInitialized,

    #[error("Unauthorized creator")]
    UnauthorizedCreator,

    #[error("Unauthorized hunter")]
    UnauthorizedHunter,

    #[error("Bounty not open")]
    BountyNotOpen,

    #[error("Bounty not approved")]
    BountyNotApproved,

    #[error("Deadline not passed")]
    DeadlineNotPassed,

    #[error("Failed to transfer SOL")]
    TransferFailed,
    
    #[error("Submission not found")]
    SubmissionNotFound,
    
    #[error("Invalid submission")]
    InvalidSubmission,
    
    #[error("Submission already approved")]
    SubmissionAlreadyApproved,

    #[error("Already voted")]
    AlreadyVoted,

    #[error("Invalid vote type")]
    InvalidVoteType,

    #[error("Invalid severity")]
    InvalidSeverity,

    #[error("Maximum winners reached")]
    MaxWinnersReached,

    #[error("Payout amount exceeds limit")]
    PayoutExceedsLimit,

    #[error("Submission already selected as winner")]
    SubmissionAlreadyWinner,
}

impl From<BountyError> for ProgramError {
    fn from(e: BountyError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for BountyError {
    fn type_of() -> &'static str {
        "BountyError"
    }
}
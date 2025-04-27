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
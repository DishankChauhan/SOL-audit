use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum BountyInstruction {
    /// Create a new bounty with SOL locked in vault
    /// 
    /// Accounts:
    /// 0. `[signer]` Creator account - the user creating and funding the bounty
    /// 1. `[writable]` Bounty account (PDA) - to store bounty information
    /// 2. `[writable]` Vault account (PDA) - to store locked SOL
    /// 3. `[]` System program
    CreateBounty {
        /// Amount in lamports to fund the bounty
        amount: u64,
        /// Deadline as unix timestamp in seconds
        deadline: i64,
        /// Optional custom seed for PDA derivation
        custom_seed: Option<Vec<u8>>,
    },

    /// Submit work for a bounty (optional)
    /// 
    /// Accounts:
    /// 0. `[signer]` Hunter account - the user submitting work
    /// 1. `[writable]` Bounty account (PDA)
    SubmitWork {
        /// Optional submission details, can be used by frontend
        submission_url: String,
    },

    /// Approve a hunter's submission
    /// 
    /// Accounts:
    /// 0. `[signer]` Creator account - the bounty creator approving the submission
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[]` Hunter account - the account that will receive the reward
    ApproveSubmission {
        /// Public key of the hunter to approve
        hunter: Pubkey,
    },

    /// Claim bounty reward after approval
    /// 
    /// Accounts:
    /// 0. `[signer]` Hunter account - the approved hunter claiming the reward
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[writable]` Vault account (PDA) - holds the SOL to be claimed
    /// 3. `[]` System program
    ClaimBounty,

    /// Cancel a bounty and return funds to creator (only if past deadline)
    /// 
    /// Accounts:
    /// 0. `[signer]` Creator account - the bounty creator
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[writable]` Vault account (PDA) - holds the SOL to be returned
    /// 3. `[]` System program
    CancelBounty,
} 
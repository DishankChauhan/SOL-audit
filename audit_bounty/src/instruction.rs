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
        /// Maximum number of winners (default 1)
        winners_count: Option<u8>,
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
        /// Submission ID
        submission_id: String,
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

    /// Cancels a bounty by creator at any time
    /// Accounts:
    /// 0. `[signer]` Creator account
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[writable]` Vault account (PDA)
    /// 3. `[]` System program
    CancelBountyEmergency,

    /// Records detailed submission metadata on-chain
    /// Accounts:
    /// 0. `[signer]` Hunter account
    /// 1. `[]` Bounty account (PDA)
    /// 2. `[writable]` Submission metadata account (PDA)
    /// 3. `[]` System program
    RecordSubmission {
        /// Unique submission ID
        submission_id: String,
        /// Severity rating (1-5)
        severity: u8,
        /// Brief description of findings
        description: String,
        /// IPFS hash of the detailed report
        ipfs_hash: String,
    },

    /// Vote on a submission (up or down)
    /// Accounts:
    /// 0. `[signer]` Voter account
    /// 1. `[]` Bounty account (PDA)
    /// 2. `[writable]` Submission account (PDA)
    /// 3. `[writable]` Vote account (PDA)
    /// 4. `[]` System program
    VoteOnSubmission {
        /// Submission ID to vote on
        submission_id: String,
        /// Vote type (true = upvote, false = downvote)
        is_upvote: bool,
    },

    /// Select a winner based on votes
    /// Accounts:
    /// 0. `[signer]` Creator account
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[writable]` Submission account (PDA)
    /// 3. `[]` System program
    SelectWinner {
        /// Submission ID to select as winner
        submission_id: String,
        /// Amount to pay this winner (must be <= bounty total / winners_count)
        payout_amount: u64,
    },

    /// Distribute remaining bounty to creator
    /// Accounts:
    /// 0. `[signer]` Creator account
    /// 1. `[writable]` Bounty account (PDA)
    /// 2. `[writable]` Vault account (PDA)
    /// 3. `[]` System program
    FinalizeAndDistributeRemaining,
} 
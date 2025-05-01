use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum BountyStatus {
    Open,
    Approved,
    Claimed,
    Cancelled,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct BountyAccount {
    pub creator: Pubkey,        // Who created this bounty
    pub hunter: Option<Pubkey>, // Who won the bounty (None until approved)
    pub amount: u64,            // Amount locked (in lamports)
    pub deadline: i64,          // Expiry timestamp (unix seconds)
    pub status: BountyStatus,   // Open, Approved, Claimed, Cancelled
    pub initialized: bool,      // Initialization flag
    pub winners_count: u8,      // Maximum number of winners (default 1)
    pub current_winners: u8,    // Current number of winners selected
}

impl BountyAccount {
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct Submission {
    pub id: String,             // Unique submission ID
    pub bounty_id: Pubkey,      // Associated bounty
    pub auditor: Pubkey,        // Who submitted the work
    pub description: String,    // Brief description
    pub ipfs_hash: String,      // IPFS hash of the detailed report
    pub severity: u8,           // Severity level (1-5)
    pub upvotes: u64,           // Number of upvotes
    pub downvotes: u64,         // Number of downvotes
    pub status: SubmissionStatus, // Status of the submission
    pub payout_amount: Option<u64>, // Amount paid if approved
    pub is_winner: bool,        // If this submission was selected as a winner
    pub created_at: i64,        // Timestamp when created
}

impl Submission {
    pub fn is_initialized(&self) -> bool {
        !self.id.is_empty()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum SubmissionStatus {
    Pending,
    Approved,
    Rejected,
    Disputed,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct Vote {
    pub voter: Pubkey,          // Who voted
    pub submission: Pubkey,     // Which submission was voted on
    pub bounty: Pubkey,         // Associated bounty
    pub vote_type: VoteType,    // Type of vote
    pub timestamp: i64,         // When the vote was cast
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum VoteType {
    None,
    Up,
    Down,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct Dispute {
    pub id: u64,
    pub bounty_id: u64,
    pub submission_id: u64,
    pub status: DisputeStatus,
    pub resolution: Option<DisputeResolution>,
}

impl Dispute {
    pub fn is_initialized(&self) -> bool {
        self.id != 0
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum DisputeStatus {
    Pending,
    Resolved,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum DisputeResolution {
    SubmitterWon,
    DisputerWon,
    Compromise,
} 
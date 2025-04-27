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
}

impl BountyAccount {
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub struct Submission {
    pub id: u64,
    pub bounty_id: u64,
    pub auditor: Pubkey,
    pub description: String,
    pub severity: String,
    pub poc_url: String,
    pub fix_url: Option<String>,
    pub status: SubmissionStatus,
    pub payout_amount: Option<u64>,
    pub disputes_count: u64,
}

impl Submission {
    pub fn is_initialized(&self) -> bool {
        self.id != 0
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
    Auditor,
    Owner,
} 